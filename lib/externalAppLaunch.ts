import { Capacitor } from "@capacitor/core";

/**
 * Opens an external app URL (a custom scheme like `comgooglemaps://` or a
 * universal link like `https://maps.apple.com/...`) from inside the app.
 *
 * Root cause this exists to fix: navigating to an external scheme or
 * cross-origin URL via `window.location.href` / `window.open` is unreliable
 * from inside Capacitor's WKWebView — the webview's own navigation handling
 * can silently swallow it, which is why "Open in Maps" did nothing on the
 * installed iOS app despite working fine in a regular mobile browser.
 *
 * On native platforms, this uses `@capacitor/app-launcher`'s `openUrl`,
 * which calls `UIApplication.open`/the Android equivalent directly —
 * bypassing the webview entirely — and reports whether it actually
 * succeeded, so `appUrl` failing (e.g. the target app isn't installed) falls
 * back to `webUrl`. Deliberately never uses `AppLauncher.canOpenUrl`, which
 * would require declaring every scheme in `LSApplicationQueriesSchemes`
 * (Info.plist) — `openUrl`'s own result is enough.
 *
 * On the web, behavior is unchanged from before: `window.location.href`.
 */
export async function openExternalAppUrl(appUrl: string, webUrl: string): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { AppLauncher } = await import("@capacitor/app-launcher");
      const { completed } = await AppLauncher.openUrl({ url: appUrl });

      if (completed) {
        return;
      }
    } catch {
      // Fall through to the web-URL attempt below.
    }

    try {
      const { AppLauncher } = await import("@capacitor/app-launcher");
      const { completed } = await AppLauncher.openUrl({ url: webUrl });

      if (completed) {
        return;
      }
    } catch {
      // Fall through to the plain window navigation as a last resort.
    }
  }

  window.location.href = webUrl;
}
