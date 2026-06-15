export type ZoomRange = {
  min: number;
  max: number;
  step: number;
};

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

export function readVideoTrackZoom(track: MediaStreamTrack | undefined) {
  if (!track?.getSettings) {
    return 1;
  }

  const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
  return settings.zoom ?? 1;
}

export async function applyVideoTrackZoom(track: MediaStreamTrack, zoom: number) {
  const range = readVideoTrackZoomRange(track);

  if (!range) {
    return false;
  }

  const clamped = Math.max(range.min, Math.min(range.max, zoom));

  try {
    await track.applyConstraints({
      advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
    });

    return true;
  } catch {
    return false;
  }
}

/** Map vertical drag (px up = positive delta) to zoom level. */
export function zoomFromVerticalDrag(
  startZoom: number,
  startClientY: number,
  currentClientY: number,
  range: ZoomRange,
  dragSpanPx = 180
) {
  const deltaY = startClientY - currentClientY;
  const span = Math.max(dragSpanPx, 1);
  const next = startZoom + (deltaY / span) * (range.max - range.min);
  return Math.max(range.min, Math.min(range.max, next));
}
