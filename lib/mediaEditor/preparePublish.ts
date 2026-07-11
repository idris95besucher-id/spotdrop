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
import { getVideoDurationSeconds, MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";
import { logVideoQuality, probeVideoFile } from "@/lib/videoQualityDiagnostics";

export type PreparedPublishMedia = {
  file: File;
  /** True when video should play muted in the viewer (no audio / user removed sound). */
  audioMuted: boolean;
};

function resolveSourceDuration(item: MediaEditorItem) {
  if (item.sourceDuration > 0) {
    return item.sourceDuration;
  }

  if (item.trimEnd > 0) {
    return item.trimEnd;
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

  const sourceProbe = await probeVideoFile(item.file);
  logVideoQuality("publish source", {
    ...sourceProbe,
    exportedResolution:
      sourceProbe.width && sourceProbe.height
        ? `${sourceProbe.width}x${sourceProbe.height}`
        : null,
    keepSound: item.keepSound,
  });

  let sourceDuration = resolveSourceDuration(item);

  if (sourceDuration <= 0) {
    sourceDuration = await getVideoDurationSeconds(item.file).catch(() => 0);
  }

  const trimEnd = getResolvedTrimEnd(item, sourceDuration);
  const trimStart = item.trimStart;
  const clipDuration = getClipDurationSeconds(item, sourceDuration);

  if (!item.keepSound) {
    if (clipDuration <= 0.05 && item.file.size > 0 && (isIosSafari() || isCapacitorNative())) {
      return { file: item.file, audioMuted: true };
    }

    if (clipDuration <= 0.05) {
      throw new Error("Choose a valid clip before publishing.");
    }

    return exportMutedVideoForPublish(item, trimStart, trimEnd);
  }

  if (clipDuration <= 0.05) {
    if (item.trimConfirmed && item.file.size > 0 && (isIosSafari() || isCapacitorNative())) {
      console.log("[UPLOAD] gallery video duration unknown — uploading full file", {
        fileSizeMb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
        fileType: item.file.type || "(unknown)",
      });
      return { file: item.file, audioMuted: false };
    }

    throw new Error("Choose a valid clip before publishing.");
  }

  if (clipDuration > MAX_TRIM_CLIP_SECONDS + 0.01) {
    throw new Error(`Clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less.`);
  }

  if (shouldReuseOriginalVideoFile(item, sourceDuration)) {
    console.log("[UPLOAD] export skipped (reuse original file)", {
      reEncoded: false,
      fileSizeMb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
      fileType: item.file.type || "(unknown)",
      trimStart,
      trimEnd,
      clipDuration,
    });
    logVideoQuality("publish export skipped", {
      ...sourceProbe,
      reEncoded: false,
      exportedMimeType: item.file.type || null,
      exportedResolution:
        sourceProbe.width && sourceProbe.height
          ? `${sourceProbe.width}x${sourceProbe.height}`
          : null,
      exportedBitrateMbps: sourceProbe.estimatedBitrateMbps,
      finalUploadSizeBytes: item.file.size,
    });
    return { file: item.file, audioMuted: false };
  }

  console.log("[UPLOAD] export required (desktop trim re-encode)", {
    reEncoded: true,
    fileSizeMb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
    trimStart,
    trimEnd,
    clipDuration,
  });

  const exported = await exportVideoFile(item.file, {
    startSeconds: trimStart,
    endSeconds: trimEnd,
    mute: false,
  });

  const exportProbe = await probeVideoFile(exported);
  logVideoQuality("publish export complete", {
    ...sourceProbe,
    ...exportProbe,
    reEncoded: exported !== item.file,
    exportedResolution:
      exportProbe.width && exportProbe.height
        ? `${exportProbe.width}x${exportProbe.height}`
        : null,
    exportedBitrateMbps: exportProbe.estimatedBitrateMbps,
    exportedMimeType: exported.type || null,
    finalUploadSizeBytes: exported.size,
  });

  return { file: exported, audioMuted: false };
}
