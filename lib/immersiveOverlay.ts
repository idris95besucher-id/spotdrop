const BODY_ATTR = "data-immersive-overlay";

/** Hide mobile chrome (e.g. bottom nav) while a full-screen camera or capture UI is open. */
export function setImmersiveOverlayActive(active: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  if (active) {
    document.body.setAttribute(BODY_ATTR, "true");
    return;
  }

  document.body.removeAttribute(BODY_ATTR);
}
