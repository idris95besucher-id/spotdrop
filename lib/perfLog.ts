/** Temporary App Store perf instrumentation — search logs for `[Perf]`. */

type PerfPayload = Record<string, unknown>;

export function perfLog(event: string, payload?: PerfPayload) {
  if (typeof window === "undefined") {
    return;
  }

  if (payload && Object.keys(payload).length > 0) {
    console.log(`[Perf] ${event}`, payload);
    return;
  }

  console.log(`[Perf] ${event}`);
}

export function perfMark(screen: string) {
  const at = typeof performance !== "undefined" ? performance.now() : Date.now();
  perfLog("screen mount", { screen, atMs: Math.round(at) });
  return at;
}

export function perfSince(markAt: number, event: string, extra?: PerfPayload) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  perfLog(event, { elapsedMs: Math.round(now - markAt), ...extra });
}
