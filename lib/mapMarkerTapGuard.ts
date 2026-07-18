/** CSS selector for MapLibre HTML markers and SpotDrop interactive map pins. */
export const MAP_INTERACTIVE_MARKER_SELECTOR = [
  ".maplibregl-marker",
  "[data-map-interactive-marker]",
  ".spot-live-spot-marker-anchor",
  ".spot-live-spot-marker",
  ".spot-live-share-marker-anchor",
  ".spot-live-share-marker",
  ".spot-live-user-marker-anchor",
  ".spot-live-user-marker",
  ".spot-map-public-mark-anchor",
  ".spot-map-public-mark",
  ".spot-map-public-mark-cluster-anchor",
  ".spot-map-public-mark-cluster",
].join(", ");

export function isMapInteractiveMarkerTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest(MAP_INTERACTIVE_MARKER_SELECTOR));
}

/**
 * Bind capture-phase listeners so marker taps never fall through to the map
 * background click / long-press "This place" flow (MapLibre + iOS WKWebView).
 */
export function bindMapMarkerTapShield(
  element: HTMLElement,
  options: {
    onActivate?: (event: Event) => void;
    onGuard?: () => void;
  } = {}
) {
  element.dataset.mapInteractiveMarker = "true";

  const shield = (event: Event) => {
    event.stopPropagation();

    if (typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
      (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
    }

    options.onGuard?.();
  };

  const activate = (event: Event) => {
    shield(event);
    options.onActivate?.(event);
  };

  // Capture phase: win before MapLibre / parent handlers see the event.
  element.addEventListener("pointerdown", shield, true);
  element.addEventListener("touchstart", shield, { capture: true, passive: true });
  element.addEventListener("mousedown", shield, true);
  element.addEventListener("click", activate, true);
}
