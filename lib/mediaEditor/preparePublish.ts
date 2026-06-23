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
  if (!videoPublishNeedsExport(item, sourceDuration)) {
    return true;
  }

  // iOS/Capacitor: upload native MP4 directly — no re-encode in WKWebView.
  if (isIosSafari() || isCapacitorNative()) {
    return true;
  }

  // Under 50 MB: upload original unless desktop trim export is the only option.
  // Trim on desktop web still requires export; size alone does not force re-encode.
  if (item.file.size <= MAX_DIRECT_UPLOAD_BYTES) {
    return false;
  }

  // Over 50 MB without a trim/export path — upload original (no compressor available).
  console.log("[UPLOAD] export skipped (file > 50MB, no compressor — upload original)", {
    fileSizeMb: item.file.size / (1024 * 1024),
  });
  return true;
}

export async function prepareMediaFileForPublish(item: MediaEditorItem): Promise<File> {
  if (item.mediaType !== "video") {
    return item.file;
  }

  let sourceDuration = resolveSourceDuration(item);

  if (sourceDuration <= 0) {
    sourceDuration = await getVideoDurationSeconds(item.file);
  }

  const trimEnd = getResolvedTrimEnd(item, sourceDuration);
  const trimStart = item.trimStart;
  const clipDuration = getClipDurationSeconds(item, sourceDuration);

  if (clipDuration <= 0.05) {
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
    return item.file;
  }

  console.log("[UPLOAD] export required (desktop trim re-encode)", {
    reEncoded: true,
    fileSizeMb: Math.round((item.file.size / (1024 * 1024)) * 100) / 100,
    trimStart,
    trimEnd,
    clipDuration,
  });

  return exportVideoFile(item.file, {
    startSeconds: trimStart,
    endSeconds: trimEnd,
    mute: false,
  });
}
