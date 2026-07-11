const BODY_ATTR = "data-map-search-keyboard";

/**
 * Map page only: hide the mobile bottom nav while map search is focused
 * or the software keyboard is open (Capacitor WKWebView / iOS).
 */
export function setMapSearchKeyboardNavHidden(hidden: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  if (hidden) {
    document.body.setAttribute(BODY_ATTR, "true");
    return;
  }

  document.body.removeAttribute(BODY_ATTR);
}
