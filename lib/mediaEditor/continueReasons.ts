import type { MediaEditorItem } from "@/lib/mediaEditor/types";
import {
  MIN_TRIM_CLIP_SECONDS,
  formatTrimTime,
  getResolvedTrimEndValue,
  isTrimSelectionValid,
} from "@/lib/mediaEditor/trimTimeline";
import {
  getClipDurationSeconds,
  requiresTrimForVideo,
} from "@/lib/mediaEditor/trimValidation";
import { MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";

export function getVideoPreviewContinueBlockReason(item: MediaEditorItem): string | null {
  if (item.mediaType !== "video") {
    return null;
  }

  if (item.sourceDuration <= 0) {
    return "Loading video duration…";
  }

  if (!isTrimSelectionValid(item.trimStart, item.trimEnd, item.sourceDuration)) {
    return getTrimContinueBlockReason(
      item.trimStart,
      item.trimEnd,
      item.sourceDuration,
      false
    );
  }

  const clipDuration = getClipDurationSeconds(item, item.sourceDuration);

  if (clipDuration < MIN_TRIM_CLIP_SECONDS - 0.01) {
    return `Selected clip must be at least ${MIN_TRIM_CLIP_SECONDS} second. Drag the trim handles.`;
  }

  if (clipDuration > MAX_TRIM_CLIP_SECONDS + 0.01) {
    return `Selected clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less. Drag the trim handles.`;
  }

  return null;
}

export function getTrimContinueBlockReason(
  trimStart: number,
  trimEnd: number,
  sourceDuration: number,
  loadingDuration: boolean
): string | null {
  if (loadingDuration) {
    return "Loading video duration…";
  }

  if (sourceDuration <= 0) {
    return "Unable to read video duration.";
  }

  if (isTrimSelectionValid(trimStart, trimEnd, sourceDuration)) {
    return null;
  }

  const resolvedEnd = getResolvedTrimEndValue(trimEnd, sourceDuration);
  const clipDuration = resolvedEnd - trimStart;

  if (trimStart >= resolvedEnd - 0.01) {
    return "Move the handles apart to select a clip.";
  }

  if (clipDuration < MIN_TRIM_CLIP_SECONDS - 0.01) {
    return `Clip must be at least ${MIN_TRIM_CLIP_SECONDS} second.`;
  }

  if (clipDuration > MAX_TRIM_CLIP_SECONDS + 0.01) {
    return `Clip cannot exceed ${formatTrimTime(MAX_TRIM_CLIP_SECONDS)}. Drag the end handle.`;
  }

  if (requiresTrimForVideo(sourceDuration)) {
    return `Video exceeds ${MAX_TRIM_CLIP_SECONDS}s. Drag the handles to select a shorter clip.`;
  }

  return "Adjust the trim handles to select a valid clip.";
}

export function getCoverContinueBlockReason(
  videoLoaded: boolean,
  useAutoCover: boolean,
  continuing: boolean
): string | null {
  if (continuing) {
    return null;
  }

  if (!videoLoaded && !useAutoCover) {
    return "Loading video for frame selection…";
  }

  return null;
}

export function formatTrimSummary(
  trimStart: number,
  trimEnd: number,
  sourceDuration: number
): string {
  const resolvedEnd = getResolvedTrimEndValue(trimEnd, sourceDuration);
  const clipDuration = Math.max(0, resolvedEnd - trimStart);
  return `${formatTrimTime(trimStart)} – ${formatTrimTime(resolvedEnd)} (${formatTrimTime(clipDuration)})`;
}
