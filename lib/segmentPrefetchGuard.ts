/**
 * Runs before React on Capacitor — silences the App Router's static-export segment-cache
 * prefetch requests.
 *
 * Root cause: in `output: "export"` mode, Next's client router (segment cache) warms
 * navigation by requesting per-route-segment "tree" files it expects the static host to
 * have generated, named `__next<segment-path-with-dots>.txt` (e.g. `__next._tree.txt`,
 * see `next/dist/shared/lib/segment-cache/segment-value-encoding.js`). Capacitor serves
 * the exported `out/` directory as a plain static bundle; those synthetic files are often
 * missing for the active route, so WKWebView logs:
 *   Failed to load resource: "__next._tree.txt" couldn't be opened because there is no such file.
 *
 * Next already treats a miss (including HTTP 204) as harmless and falls back to a normal
 * navigation — we just need to stop the request from hitting the native file server.
 *
 * Important implementation notes (why the previous guard failed on device):
 * 1. `next/script` `beforeInteractive` is queued via `self.__next_s` and can run *after*
 *    the router has already started prefetching — too late. This script must be a true
 *    synchronous inline `<script>` in `<head>`.
 * 2. `window.Capacitor` is often not injected yet when the first script runs, so an
 *    early `if (!Capacitor) return` permanently skipped the patch. Native detection must
 *    also use `location.protocol === "capacitor:"` (available immediately in Cap iOS).
 * 3. Only active in the native Capacitor app — never on the normal https web/Vercel build.
 */
export const SEGMENT_PREFETCH_GUARD_SCRIPT = `
(function () {
  try {
    var g = typeof globalThis !== "undefined" ? globalThis : window;
    if (g.__SPOTDROP_SEGMENT_PREFETCH_GUARD__) return;

    function isNativeCapacitor() {
      try {
        var protocol = (location && location.protocol) || "";
        if (protocol === "capacitor:" || protocol === "ionic:") return true;
        var cap = g.Capacitor;
        if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
          return true;
        }
      } catch (e) {}
      return false;
    }

    // Web/Vercel (https/http) — leave fetch completely alone.
    if (!isNativeCapacitor()) return;

    g.__SPOTDROP_SEGMENT_PREFETCH_GUARD__ = true;

    if (typeof g.fetch !== "function") return;

    var originalFetch = g.fetch.bind(g);
    // Matches /profile/__next._tree.txt, capacitor://localhost/x/__next._full.txt, etc.
    var segmentFilePattern = /(?:^|\\/)__next[^/]*\\.txt(?:[?#].*)?$/i;

    function resolveUrl(input) {
      try {
        if (typeof input === "string") return input;
        if (input && typeof input.url === "string") return input.url;
        if (typeof URL !== "undefined" && input instanceof URL) return String(input);
      } catch (e) {}
      return "";
    }

    function isSegmentPrefetchUrl(url) {
      if (!url) return false;
      try {
        // Absolute capacitor:// / http(s):// URLs — test pathname; relative paths — test as-is.
        if (url.indexOf("://") !== -1 && typeof URL !== "undefined") {
          return segmentFilePattern.test(new URL(url, location.href).pathname);
        }
      } catch (e) {}
      return segmentFilePattern.test(url);
    }

    function silentMiss() {
      return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
    }

    function guardedFetch(input, init) {
      try {
        if (isSegmentPrefetchUrl(resolveUrl(input))) {
          return silentMiss();
        }
      } catch (e) {}
      return originalFetch(input, init);
    }

    g.fetch = guardedFetch;

    // Capacitor / other bridges sometimes wrap fetch after boot — keep our guard on top.
    var rewrapAttempts = 0;
    var rewrapId = g.setInterval(function () {
      rewrapAttempts += 1;
      try {
        if (g.fetch !== guardedFetch) {
          originalFetch = g.fetch.bind(g);
          g.fetch = guardedFetch;
        }
      } catch (e) {}
      if (rewrapAttempts >= 40) {
        g.clearInterval(rewrapId);
      }
    }, 50);
  } catch (e) {}
})();
`.trim();
