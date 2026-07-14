import type { MediaEditorItem } from "@/lib/mediaEditor/types";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import { isIosSafari } from "@/lib/cameraCapture";
import {
  getClipDurationSeconds,
  getResolvedTrimEnd,
  videoPublishNeedsExport,
} from "@/lib/mediaEditor/trimValidation";
import { MAX_DIRECT_UPLOAD_BYTES } from "@/lib/spotUploadTiming";
import { exportVideoFile } from "@/lib/videoExport";
import {
  getVideoDurationSeconds,
  isVideoLongerThanMaxSeconds,
  MAX_TRIM_CLIP_SECONDS,
  normalizeVideoDurationSeconds,
} from "@/lib/videoTrim";

export type PreparedPublishMedia = {
  file: File;
  /** True when video should play muted in the viewer (no audio / user removed sound). */
  audioMuted: boolean;
};

/**
 * Resolve the real source duration for validation.
 * Prefer a fresh file probe — never trust Infinity / trimEnd stand-ins.
 */
async function resolveActualVideoDurationSeconds(item: MediaEditorItem): Promise<number> {
  const fromItem = normalizeVideoDurationSeconds(item.sourceDuration);
  const probed = await getVideoDurationSeconds(item.file).catch(() => 0);
  const fromProbe = normalizeVideoDurationSeconds(probed);

  // Prefer the probed file duration when available — it is the upload source of truth.
  if (fromProbe > 0) {
    return fromProbe;
  }

  if (fromItem > 0) {
    return fromItem;
  }

  // Last resort: trimEnd only when it looks like a real measured end, not the max-cap default.
  const fromTrimEnd = normalizeVideoDurationSeconds(item.trimEnd);

  if (fromTrimEnd > 0 && fromTrimEnd <= MAX_TRIM_CLIP_SECONDS + 0.05) {
    return fromTrimEnd;
  }

  return 0;
}

function shouldReuseOriginalVideoFile(item: MediaEditorItem, sourceDuration: number) {
  if (!item.keepSound) {
    return false;
  }

  if (!videoPublishNeedsExport(item, sourceDuration)) {
    return true;
  }

  if (isIosSafari() || isCapacitorNative()) {
    return true;
  }

  if (item.file.size <= MAX_DIRECT_UPLOAD_BYTES) {
    return false;
  }

  console.log("[UPLOAD] export skipped (file > 50MB, no compressor — upload original)", {
    fileSizeMb: item.file.size / (1024 * 1024),
  });
  return true;
}

async function exportMutedVideoForPublish(
  item: MediaEditorItem,
  trimStart: number,
  trimEnd: number
): Promise<PreparedPublishMedia> {
  try {
    const exported = await exportVideoFile(item.file, {
      startSeconds: trimStart,
      endSeconds: trimEnd,
      mute: true,
    });

    return {
      file: exported,
      audioMuted: true,
    };
  } catch (error) {
    console.warn("[UPLOAD] muted video export failed — marking audio_muted metadata", error);

    return {
      file: item.file,
      audioMuted: true,
    };
  }
}

export async function prepareMediaFileForPublish(item: MediaEditorItem): Promise<PreparedPublishMedia> {
  if (item.mediaType !== "video") {
    return { file: item.file, audioMuted: false };
  }

  // No SHA-256/MP4-box diagnostics here anymore — those read and hashed the
  // *entire* file before upload even started (twice: once here, once again in
  // uploadPostMedia) purely for now-resolved corruption debugging, and were
  // the dominant cause of "Uploading video..." sitting for a long time before
  // any network activity began. Duration is still measured for real
  // validation (the 30s cap below); that's a lightweight `<video>` metadata
  // load, not a full-file read.
  const sourceDuration = await resolveActualVideoDurationSeconds(item);
  const trimEnd = getResolvedTrimEnd(item, sourceDuration);
  const trimStart = Math.max(0, item.trimStart);
  const clipDuration = sourceDuration > 0 ? getClipDurationSeconds(item, sourceDuration) : 0;

  console.log("[UPLOAD] video duration check", {
    detectedDurationSeconds: sourceDuration,
    itemSourceDuration: item.sourceDuration,
    itemTrimStart: item.trimStart,
    itemTrimEnd: item.trimEnd,
    resolvedTrimStart: trimStart,
    resolvedTrimEnd: trimEnd,
    clipDurationSeconds: clipDuration,
    maxAllowedSeconds: MAX_TRIM_CLIP_SECONDS,
    fileName: item.file.name,
    fileSize: item.file.size,
    fileType: item.file.type || "(unknown)",
  });

  if (!item.keepSound) {
    if (clipDuration <= 0.05 && item.file.size > 0 && (isIosSafari() || isCapacitorNative())) {
      if (isVideoLongerThanMaxSeconds(sourceDuration)) {
        throw new Error(`Clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less.`);
      }

      return { file: item.file, audioMuted: true };
    }

    if (clipDuration <= 0.05) {
      throw new Error("Choose a valid clip before publishing.");
    }

    if (isVideoLongerThanMaxSeconds(clipDuration)) {
      throw new Error(`Clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less.`);
    }

    return exportMutedVideoForPublish(item, trimStart, trimEnd);
  }

  // Duration unknown: on iOS allow upload of camera/gallery files that already
  // passed the in-app recorder / gallery gate, but never invent a false over-limit error.
  if (sourceDuration <= 0 || clipDuration <= 0.05) {
    if (item.file.size > 0 && (isIosSafari() || isCapacitorNative())) {
      console.log("[UPLOAD] duration unavailable after probe — allowing native upload", {
        fileSizeMb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
        fileType: item.file.type || "(unknown)",
        trimConfirmed: item.trimConfirmed,
      });
      return { file: item.file, audioMuted: false };
    }

    throw new Error("Choose a valid clip before publishing.");
  }

  // Only reject when the *real* clip length exceeds the max.
  if (isVideoLongerThanMaxSeconds(clipDuration)) {
    console.warn("[UPLOAD] video rejected — exceeds max duration", {
      detectedDurationSeconds: sourceDuration,
      clipDurationSeconds: clipDuration,
      maxAllowedSeconds: MAX_TRIM_CLIP_SECONDS,
    });
    throw new Error(`Clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less.`);
  }

  if (shouldReuseOriginalVideoFile(item, sourceDuration)) {
    console.log("[UPLOAD] export skipped (reuse original file)", {
      reEncoded: false,
      fileSizeMb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
      fileType: item.file.type || "(unknown)",
      detectedDurationSeconds: sourceDuration,
      trimStart,
      trimEnd,
      clipDurationSeconds: clipDuration,
    });
    return { file: item.file, audioMuted: false };
  }

  console.log("[UPLOAD] export required (desktop trim re-encode)", {
    reEncoded: true,
    fileSizeMb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
    detectedDurationSeconds: sourceDuration,
    trimStart,
    trimEnd,
    clipDurationSeconds: clipDuration,
  });

  const exported = await exportVideoFile(item.file, {
    startSeconds: trimStart,
    endSeconds: trimEnd,
    mute: false,
  });

  console.log("[UPLOAD] export complete", {
    reEncoded: exported !== item.file,
    exportedMimeType: exported.type || null,
    finalUploadSizeBytes: exported.size,
  });

  return { file: exported, audioMuted: false };
}
