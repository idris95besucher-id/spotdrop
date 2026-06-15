import { clampTrimRange, MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";

export const MIN_TRIM_CLIP_SECONDS = 1;

export function formatTrimTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function getResolvedTrimEndValue(trimEnd: number, sourceDuration: number) {
  if (sourceDuration <= 0) {
    return 0;
  }

  if (trimEnd > 0) {
    return Math.min(trimEnd, sourceDuration);
  }

  return sourceDuration;
}

export function getClipDurationFromTrim(
  trimStart: number,
  trimEnd: number,
  sourceDuration: number
) {
  const resolvedEnd = getResolvedTrimEndValue(trimEnd, sourceDuration);
  return Math.max(0, resolvedEnd - trimStart);
}

export function clampTrimSelection(
  start: number,
  end: number,
  duration: number,
  maxClip = MAX_TRIM_CLIP_SECONDS,
  minClip = MIN_TRIM_CLIP_SECONDS
) {
  if (duration <= 0) {
    return { start: 0, end: 0 };
  }

  const ranged = clampTrimRange(start, end, duration, maxClip);
  let safeStart = ranged.start;
  let safeEnd = ranged.end;

  if (safeEnd - safeStart < minClip) {
    if (safeEnd + minClip <= duration) {
      safeEnd = safeStart + minClip;
    } else {
      safeStart = Math.max(0, safeEnd - minClip);
    }
  }

  if (safeEnd - safeStart > maxClip) {
    safeEnd = safeStart + maxClip;
  }

  return { start: safeStart, end: safeEnd };
}

export function isTrimSelectionValid(
  trimStart: number,
  trimEnd: number,
  sourceDuration: number
) {
  if (sourceDuration <= 0) {
    return false;
  }

  const resolvedEnd = getResolvedTrimEndValue(trimEnd, sourceDuration);
  const clipDuration = resolvedEnd - trimStart;

  if (trimStart >= resolvedEnd - 0.01) {
    return false;
  }

  if (clipDuration < MIN_TRIM_CLIP_SECONDS - 0.01) {
    return false;
  }

  if (clipDuration > MAX_TRIM_CLIP_SECONDS + 0.01) {
    return false;
  }

  if (sourceDuration > MAX_TRIM_CLIP_SECONDS + 0.05) {
    const usesPartialClip =
      trimStart > 0.05 || resolvedEnd < sourceDuration - 0.05;

    if (!usesPartialClip) {
      return false;
    }
  }

  return true;
}

export function timeToRatio(time: number, duration: number) {
  if (duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, time / duration));
}

export function ratioToTime(ratio: number, duration: number) {
  return Math.max(0, Math.min(duration, ratio * duration));
}
