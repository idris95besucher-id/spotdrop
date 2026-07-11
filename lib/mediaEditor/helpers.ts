import type { MediaEditorItem, MediaEditorMediaType } from "@/lib/mediaEditor/types";
import { getPostMediaType } from "@/lib/postMedia";
import { getVideoDurationSeconds } from "@/lib/videoTrim";

export function createMediaEditorItem(file: File, mediaType: MediaEditorMediaType): MediaEditorItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    mediaType,
    previewUrl: URL.createObjectURL(file),
    keepSound: mediaType === "video",
    sourceDuration: 0,
    trimStart: 0,
    trimEnd: 0,
    trimConfirmed: false,
    coverFile: null,
    coverPreviewUrl: null,
    musicTrackId: null,
    musicTrackTitle: null,
    musicTrackArtist: null,
    musicTrackCoverUrl: null,
    musicTrackAudioUrl: null,
    musicTrackDurationSeconds: null,
  };
}

export function revokeMediaEditorItem(item: MediaEditorItem) {
  URL.revokeObjectURL(item.previewUrl);

  if (item.coverPreviewUrl) {
    URL.revokeObjectURL(item.coverPreviewUrl);
  }
}

export function revokeMediaEditorItems(items: MediaEditorItem[]) {
  for (const item of items) {
    revokeMediaEditorItem(item);
  }
}

/** Gallery picks: infer type from file and mark videos ready for full-file publish. */
export async function createGalleryMediaEditorItem(file: File): Promise<MediaEditorItem | null> {
  const mediaType = getPostMediaType(file);

  if (!mediaType) {
    return null;
  }

  const item = createMediaEditorItem(file, mediaType);

  if (mediaType !== "video") {
    return item;
  }

  try {
    const duration = await getVideoDurationSeconds(file);

    if (duration > 0) {
      return {
        ...item,
        sourceDuration: duration,
        trimStart: 0,
        trimEnd: duration,
        trimConfirmed: true,
      };
    }
  } catch {
    // Duration metadata may be unavailable on some native gallery files.
  }

  return {
    ...item,
    sourceDuration: 0,
    trimStart: 0,
    trimEnd: 0,
    trimConfirmed: true,
  };
}

export function getActiveMediaEditorItem(
  items: MediaEditorItem[],
  activeIndex: number
): MediaEditorItem | null {
  if (items.length === 0) {
    return null;
  }

  const index = Math.min(Math.max(0, activeIndex), items.length - 1);
  return items[index] ?? null;
}
