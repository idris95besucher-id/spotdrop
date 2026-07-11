const SPOT_CAROUSEL_SWIPE_HINT_KEY = "spotdrop_spot_carousel_swipe_hint_seen";

export function hasSeenSpotCarouselSwipeHint() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(SPOT_CAROUSEL_SWIPE_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSpotCarouselSwipeHintSeen() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SPOT_CAROUSEL_SWIPE_HINT_KEY, "1");
  } catch {
    // Ignore storage failures.
  }
}
