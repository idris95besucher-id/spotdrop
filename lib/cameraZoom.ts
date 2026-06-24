export type ZoomRange = {
  min: number;
  max: number;
  step: number;
};

/** User-facing zoom limits (clamped against hardware capabilities). */
export const USER_ZOOM_MIN = 1;
export const USER_ZOOM_MAX = 5;

/** 200px of vertical drag = 1x zoom change (slow, TikTok-like). */
export const ZOOM_PX_PER_1X = 200;
export const ZOOM_POINTER_DEADZONE_PX = 12;
/** Minimum change before sending zoom to the camera hardware. */
export const ZOOM_APPLY_MIN_DELTA = 0.05;
/** Max hardware zoom updates per second while dragging (iOS recording-safe). */
export const ZOOM_HARDWARE_MAX_FPS = 18;
export const ZOOM_HARDWARE_INTERVAL_MS = 1000 / ZOOM_HARDWARE_MAX_FPS;
/** Per-frame easing toward finger target — lower = slower, more controlled. */
export const ZOOM_SMOOTH_FACTOR = 0.14;
export const ZOOM_SETTLE_EPSILON = 0.005;
export const ZOOM_PREVIEW_SCALE_EPSILON = 0.001;

export function shouldApplyHardwareZoom(
  nextZoom: number,
  currentZoom: number,
  lastApplyAtMs: number,
  nowMs: number,
  minDelta = ZOOM_APPLY_MIN_DELTA,
  minIntervalMs = ZOOM_HARDWARE_INTERVAL_MS
) {
  if (nowMs - lastApplyAtMs < minIntervalMs) {
    return false;
  }

  return Math.abs(nextZoom - currentZoom) >= minDelta;
}

/** CSS preview scale while hardware zoom catches up (never below 1 — avoids letterboxing). */
export function previewCssScaleRatio(previewZoom: number, committedZoom: number) {
  if (committedZoom <= 0 || previewZoom <= committedZoom + ZOOM_PREVIEW_SCALE_EPSILON) {
    return 1;
  }

  return previewZoom / committedZoom;
}

export function readVideoTrackZoomRange(track: MediaStreamTrack | undefined): ZoomRange | null {
  if (!track?.getCapabilities) {
    return null;
  }

  const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
    zoom?: { min?: number; max?: number; step?: number };
  };

  const zoom = capabilities.zoom;

  if (!zoom || zoom.max === undefined || zoom.min === undefined) {
    return null;
  }

  if (zoom.max <= zoom.min) {
    return null;
  }

  return {
    min: zoom.min,
    max: zoom.max,
    step: zoom.step ?? 0.01,
  };
}

/** Read hardware zoom once at stream start and clamp to the 1x–5x user range. */
export function buildCachedZoomRange(track: MediaStreamTrack | undefined): ZoomRange | null {
  const hardware = readVideoTrackZoomRange(track);

  if (!hardware) {
    return null;
  }

  const min = Math.max(USER_ZOOM_MIN, hardware.min);
  const max = Math.min(USER_ZOOM_MAX, hardware.max);

  if (max <= min) {
    return null;
  }

  return {
    min,
    max,
    step: hardware.step,
  };
}

export function clampZoomToRange(zoom: number, range: ZoomRange) {
  return Math.max(range.min, Math.min(range.max, zoom));
}

export function readVideoTrackZoom(track: MediaStreamTrack | undefined) {
  if (!track?.getSettings) {
    return 1;
  }

  const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
  return settings.zoom ?? 1;
}

/** Apply zoom using a pre-cached range — never reads getCapabilities(). */
export async function applyVideoTrackZoomWithRange(
  track: MediaStreamTrack,
  zoom: number,
  range: ZoomRange
) {
  const clamped = clampZoomToRange(zoom, range);

  try {
    await track.applyConstraints({
      advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
    });

    return true;
  } catch {
    return false;
  }
}

export async function applyVideoTrackZoom(track: MediaStreamTrack, zoom: number, range?: ZoomRange) {
  const resolvedRange = range ?? readVideoTrackZoomRange(track);

  if (!resolvedRange) {
    return false;
  }

  return applyVideoTrackZoomWithRange(track, zoom, resolvedRange);
}

/** Ease zoom toward the drag target — prevents sudden jumps. */
export function smoothZoomToward(
  current: number,
  target: number,
  factor = ZOOM_SMOOTH_FACTOR
) {
  const delta = target - current;

  if (Math.abs(delta) < ZOOM_SETTLE_EPSILON) {
    return target;
  }

  return current + delta * factor;
}

/** Map vertical drag: finger up → zoom in, 200px → +1x. */
export function zoomFromVerticalDrag(
  startZoom: number,
  startClientY: number,
  currentClientY: number,
  range: ZoomRange,
  pxPer1x = ZOOM_PX_PER_1X,
  deadzonePx = ZOOM_POINTER_DEADZONE_PX
) {
  const deltaY = startClientY - currentClientY;

  if (Math.abs(deltaY) < deadzonePx) {
    return clampZoomToRange(startZoom, range);
  }

  const sign = Math.sign(deltaY);
  const effectiveDeltaY = deltaY - sign * deadzonePx;
  const next = startZoom + effectiveDeltaY / pxPer1x;
  return clampZoomToRange(next, range);
}

/** CSS-only preview zoom while recording (no applyConstraints on iOS). */
export const RECORDING_CSS_ZOOM_MIN = 1;
export const RECORDING_CSS_ZOOM_MAX = 2.5;

export const RECORDING_CSS_ZOOM_RANGE: ZoomRange = {
  min: RECORDING_CSS_ZOOM_MIN,
  max: RECORDING_CSS_ZOOM_MAX,
  step: 0.01,
};

export function clampRecordingCssZoom(zoom: number) {
  return Math.max(RECORDING_CSS_ZOOM_MIN, Math.min(RECORDING_CSS_ZOOM_MAX, zoom));
}

export function formatRecordingZoomLabel(zoom: number) {
  return `${clampRecordingCssZoom(zoom).toFixed(1)}×`;
}
