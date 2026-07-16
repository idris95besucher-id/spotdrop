type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Keeps the screen awake for the duration of a long upload — a large video over a slow
 * connection can easily outlast the device's auto-lock timer, and a locked/backgrounded
 * screen is one more way an in-flight upload gets interrupted. Uses the standard Screen
 * Wake Lock API; no-ops silently where unsupported (older iOS WKWebView) rather than
 * failing the upload over a nice-to-have.
 */
export function acquireUploadWakeLock(): { release: () => void } {
  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;

  const nav = typeof navigator !== "undefined" ? (navigator as NavigatorWithWakeLock) : undefined;

  const requestLock = async () => {
    if (released || !nav?.wakeLock) {
      return;
    }

    try {
      sentinel = await nav.wakeLock.request("screen");
      console.log("[upload] screen wake lock acquired");

      sentinel.addEventListener("release", () => {
        console.log("[upload] screen wake lock released (system)");
      });
    } catch (error) {
      // Common and harmless: e.g. low battery mode, or the tab lost visibility between
      // the request being made and resolving. Not worth surfacing to the user.
      console.warn("[upload] screen wake lock request failed", error);
    }
  };

  void requestLock();

  const onVisibilityChange = () => {
    if (!released && document.visibilityState === "visible" && (!sentinel || sentinel.released)) {
      void requestLock();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    release: () => {
      if (released) {
        return;
      }

      released = true;

      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }

      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {
          // Already released or unsupported mid-release — nothing to do.
        });
      }
    },
  };
}
