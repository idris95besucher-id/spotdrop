/** Distance commit: ~18% of viewport (slow deliberate swipes). */
export const VERTICAL_POST_COMMIT_RATIO = 0.18;
/** Velocity commit threshold in px/ms (~550 px/s) for fast flicks. */
export const VERTICAL_POST_VELOCITY_COMMIT_PX_MS = 0.55;
/** Ignore tiny flicks that would otherwise trip velocity alone. */
export const VERTICAL_POST_MIN_FLICK_DISTANCE_PX = 10;
/** Snap / page spring — Instagram/TikTok-like settle. */
export const VERTICAL_POST_SPRING_MS = 280;
export const VERTICAL_POST_SPRING_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const VERTICAL_POST_EDGE_RESISTANCE = 0.28;
/** Lock input briefly after a page change; keep close to spring length. */
export const VERTICAL_POST_CHANGE_LOCK_MS = 300;

/**
 * TikTok / Reels layout:
 * - next Spot sits below (+height)
 * - previous Spot sits above (-height)
 * - dragOffset follows the finger (positive = finger moved down)
 */
export function getVerticalPostSlideOffsetPx(
  slideIndex: number,
  activeIndex: number,
  dragOffsetPx: number,
  viewportHeightPx: number
) {
  return (slideIndex - activeIndex) * viewportHeightPx + dragOffsetPx;
}

export function applyVerticalPostEdgeResistance(
  dragOffsetPx: number,
  activeIndex: number,
  itemCount: number
) {
  if (itemCount <= 0) {
    return dragOffsetPx;
  }

  // First Spot: resist swipe-down (no previous).
  if (activeIndex <= 0 && dragOffsetPx > 0) {
    return dragOffsetPx * VERTICAL_POST_EDGE_RESISTANCE;
  }

  // Last Spot: resist swipe-up (no next).
  if (activeIndex >= itemCount - 1 && dragOffsetPx < 0) {
    return dragOffsetPx * VERTICAL_POST_EDGE_RESISTANCE;
  }

  return dragOffsetPx;
}

export function resolveVerticalPostDragEnd(input: {
  deltaY: number;
  deltaX: number;
  velocityY?: number;
  activeIndex: number;
  itemCount: number;
  viewportHeightPx: number;
}) {
  const {
    deltaY,
    deltaX,
    velocityY = 0,
    activeIndex,
    itemCount,
    viewportHeightPx,
  } = input;

  if (itemCount <= 0 || viewportHeightPx <= 0) {
    return { action: "snap" as const };
  }

  const absY = Math.abs(deltaY);
  const absX = Math.abs(deltaX);
  const absVelocity = Math.abs(velocityY);
  const thresholdPx = viewportHeightPx * VERTICAL_POST_COMMIT_RATIO;

  const velocityCommit =
    absVelocity >= VERTICAL_POST_VELOCITY_COMMIT_PX_MS &&
    absY >= VERTICAL_POST_MIN_FLICK_DISTANCE_PX;
  const distanceCommit = absY >= thresholdPx;

  // Strong horizontal drag without a vertical flick → ignore.
  if (!velocityCommit && absX > absY) {
    return { action: "snap" as const };
  }

  if (!distanceCommit && !velocityCommit) {
    return { action: "snap" as const };
  }

  // Prefer velocity direction on fast flicks; otherwise use drag distance.
  let direction: 1 | -1;
  if (
    velocityCommit &&
    (Math.sign(velocityY) === Math.sign(deltaY) || absY < thresholdPx * 0.5 || deltaY === 0)
  ) {
    direction = velocityY > 0 ? 1 : -1;
  } else if (deltaY !== 0) {
    direction = deltaY > 0 ? 1 : -1;
  } else if (velocityY !== 0) {
    direction = velocityY > 0 ? 1 : -1;
  } else {
    return { action: "snap" as const };
  }

  // Swipe up (negative) → next Spot.
  if (direction < 0) {
    if (activeIndex < itemCount - 1) {
      return { action: "next" as const, targetOffsetPx: -viewportHeightPx };
    }

    return { action: "snap" as const };
  }

  // Swipe down (positive) → previous Spot.
  if (activeIndex > 0) {
    return { action: "previous" as const, targetOffsetPx: viewportHeightPx };
  }

  return { action: "snap" as const };
}
