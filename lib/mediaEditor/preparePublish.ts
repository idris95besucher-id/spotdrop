import type { MediaEditorItem } from "@/lib/mediaEditor/types";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import { isIosSafari } from "@/lib/cameraCapture";
import {
  getClipDurationSeconds,
  getResolvedTrimEnd,
  videoPublishNeedsExport,
} from "@/lib/mediaEditor/trimValidation";
import { spotUploadLog, spotUploadTime } from "@/lib/spotUploadLog";
import { exportVideoFile } from "@/lib/videoExport";
import { getVideoDurationSeconds, MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";

function shouldReuseNativeVideoFile(item: MediaEditorItem, sourceDuration: number) {
  if (!videoPublishNeedsExport(item, sourceDuration)) {
    return true;
  }

  if (isIosSafari() || isCapacitorNative()) {
    spotUploadLog("[Spot Upload] export skipped (iOS/Capacitor native mp4)");
    return true;
  }

  return false;
}

export async function prepareMediaFileForPublish(item: MediaEditorItem): Promise<File> {
  if (item.mediaType !== "video") {
    spotUploadLog("[Spot Upload] export skipped (photo)");
    return item.file;
  }

  const finishDuration = spotUploadTime("video metadata");
  const sourceDuration =
    item.sourceDuration > 0 ? item.sourceDuration : await getVideoDurationSeconds(item.file);
  finishDuration();

  const trimEnd = getResolvedTrimEnd(item, sourceDuration);
  const trimStart = item.trimStart;
  const clipDuration = getClipDurationSeconds(item, sourceDuration);

  if (clipDuration <= 0.05) {
    throw new Error("Choose a valid clip before publishing.");
  }

  if (clipDuration > MAX_TRIM_CLIP_SECONDS + 0.01) {
    throw new Error(`Clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less.`);
  }

  if (shouldReuseNativeVideoFile(item, sourceDuration)) {
    spotUploadLog("[Spot Upload] export skipped (reuse original file)");
    return item.file;
  }

  const finishExport = spotUploadTime("export");
  const exported = await exportVideoFile(item.file, {
    startSeconds: trimStart,
    endSeconds: trimEnd,
    mute: false,
  });
  finishExport();

  return exported;
}
