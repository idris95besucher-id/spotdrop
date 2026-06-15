import type { MediaEditorItem } from "@/lib/mediaEditor/types";
import {
  getClipDurationSeconds,
  getResolvedTrimEnd,
  videoPublishNeedsExport,
} from "@/lib/mediaEditor/trimValidation";
import { exportVideoFile } from "@/lib/videoExport";
import { getVideoDurationSeconds, MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";

export async function prepareMediaFileForPublish(item: MediaEditorItem): Promise<File> {
  if (item.mediaType !== "video") {
    return item.file;
  }

  const sourceDuration =
    item.sourceDuration > 0 ? item.sourceDuration : await getVideoDurationSeconds(item.file);
  const trimEnd = getResolvedTrimEnd(item, sourceDuration);
  const trimStart = item.trimStart;
  const clipDuration = getClipDurationSeconds(item, sourceDuration);

  if (clipDuration <= 0.05) {
    throw new Error("Choose a valid clip before publishing.");
  }

  if (clipDuration > MAX_TRIM_CLIP_SECONDS + 0.01) {
    throw new Error(`Clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less.`);
  }

  if (!videoPublishNeedsExport(item, sourceDuration)) {
    return item.file;
  }

  return exportVideoFile(item.file, {
    startSeconds: trimStart,
    endSeconds: trimEnd,
    mute: false,
  });
}
