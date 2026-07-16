import { isCapacitorNative } from "@/lib/capacitorUtils";

/**
 * Structured lifecycle tracing for the Spot upload pipeline — built to answer one question
 * definitively when an upload dies: *who* touched it and *when*. Every event carries the
 * same `requestId` so a single upload attempt's full timeline can be filtered out of the
 * console. Abort-adjacent events also carry a captured stack trace, since "who called
 * abort()" is exactly the kind of thing that's otherwise nearly impossible to prove after
 * the fact.
 */

export function generateUploadRequestId(): string {
  return `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const ABORT_ADJACENT_EVENTS = new Set([
  "abort-controller-created",
  "xhr-aborted-by-caller-signal",
  "xhr-aborted-by-stall",
  "xhr-aborted-by-absolute-cap",
  "signal-abort-listener-fired",
]);

export function logUploadLifecycleEvent(event: string, data: Record<string, unknown> = {}) {
  const withStack = ABORT_ADJACENT_EVENTS.has(event);

  console.log(`[upload-lifecycle] ${event}`, {
    ...data,
    at: new Date().toISOString(),
    ...(withStack ? { stack: new Error().stack } : {}),
  });
}

/**
 * Attaches every "something about the environment changed" listener the upload lifecycle
 * cares about — visibility/foreground-background, page unload, and browser navigation — for
 * the duration of one publish attempt. These only *log*; none of them abort anything. That
 * split matters: it lets us prove from the console whether a failure coincided with the app
 * backgrounding or a navigation, without that observation itself being the thing that kills
 * the request (see requirement: only abort on an explicit user cancel/leave, never a rerender
 * or an environment event happening to fire mid-upload).
 */
export function watchUploadEnvironment(requestId: string): () => void {
  const cleanups: Array<() => void> = [];

  if (typeof document !== "undefined") {
    const onVisibilityChange = () => {
      logUploadLifecycleEvent("visibility-change", { requestId, visibilityState: document.visibilityState });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibilityChange));
  }

  if (typeof window !== "undefined") {
    const onPageHide = (event: PageTransitionEvent) => {
      logUploadLifecycleEvent("page-hide", { requestId, persisted: event.persisted });
    };
    const onPopState = () => {
      logUploadLifecycleEvent("route-popstate", { requestId, href: window.location.href });
    };
    const onBeforeUnload = () => {
      logUploadLifecycleEvent("before-unload", { requestId });
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    cleanups.push(() => window.removeEventListener("pagehide", onPageHide));
    cleanups.push(() => window.removeEventListener("popstate", onPopState));
    cleanups.push(() => window.removeEventListener("beforeunload", onBeforeUnload));
  }

  if (isCapacitorNative()) {
    void import("@capacitor/app").then(({ App }) => {
      const listenerPromise = App.addListener("appStateChange", (state) => {
        logUploadLifecycleEvent("app-state-change", { requestId, isActive: state.isActive });
      });

      cleanups.push(() => {
        void listenerPromise.then((handle) => handle.remove());
      });
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

export type UploadPerfSummary = {
  requestId: string;
  originalFileSizeBytes: number;
  processedFileSizeBytes: number;
  preprocessingDurationMs: number;
  uploadDurationMs: number;
  averageUploadSpeedMbps: number;
  abortedAt: string | null;
};

export function logUploadPerfSummary(summary: UploadPerfSummary) {
  console.log("[upload-lifecycle] perf-summary", summary);
}
