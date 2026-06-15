import type { MediaEditorItem } from "@/lib/mediaEditor/types";
import { MIN_TRIM_CLIP_SECONDS } from "@/lib/mediaEditor/trimTimeline";
import { MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";

export function getResolvedTrimEnd(item: MediaEditorItem, sourceDuration: number) {
  if (sourceDuration <= 0) {
    return 0;
  }

  if (item.trimEnd > 0) {
    return Math.min(item.trimEnd, sourceDuration);
  }

  return sourceDuration;
}

export function getClipDurationSeconds(item: MediaEditorItem, sourceDuration: number) {
  const trimEnd = getResolvedTrimEnd(item, sourceDuration);
  return Math.max(0, trimEnd - item.trimStart);
}

export function getClipDurationFromRange(
  trimStart: number,
  trimEnd: number,
  sourceDuration: number
) {
  const resolvedEnd = trimEnd > 0 ? Math.min(trimEnd, sourceDuration) : sourceDuration;
  return Math.max(0, resolvedEnd - trimStart);
}

export function requiresTrimForVideo(sourceDuration: number) {
  return sourceDuration > MAX_TRIM_CLIP_SECONDS + 0.05;
}

export function isVideoTrimReady(item: MediaEditorItem, sourceDuration: number) {
  if (item.mediaType !== "video") {
    return true;
  }

  if (sourceDuration <= 0) {
    return false;
  }

  const clipDuration = getClipDurationSeconds(item, sourceDuration);

  if (clipDuration < MIN_TRIM_CLIP_SECONDS - 0.01) {
    return false;
  }

  if (clipDuration > MAX_TRIM_CLIP_SECONDS + 0.01) {
    return false;
  }

  if (!item.trimConfirmed) {
    return false;
  }

  if (requiresTrimForVideo(sourceDuration)) {
    const usesPartialClip =
      item.trimStart > 0.05 || getResolvedTrimEnd(item, sourceDuration) < sourceDuration - 0.05;

    return usesPartialClip || clipDuration <= MAX_TRIM_CLIP_SECONDS;
  }

  return true;
}

export function videoPublishNeedsExport(item: MediaEditorItem, sourceDuration: number) {
  if (item.mediaType !== "video" || sourceDuration <= 0) {
    return false;
  }

  const trimEnd = getResolvedTrimEnd(item, sourceDuration);
  const clipDuration = trimEnd - item.trimStart;

  if (clipDuration < MIN_TRIM_CLIP_SECONDS - 0.01) {
    return false;
  }

  const coversFullShortVideo =
    item.trimStart <= 0.05 &&
    trimEnd >= sourceDuration - 0.05 &&
    sourceDuration <= MAX_TRIM_CLIP_SECONDS;

  return !coversFullShortVideo;
}
