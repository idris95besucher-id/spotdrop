import type { MediaEditorItem, MediaEditorMediaType } from "@/lib/mediaEditor/types";
import { getPostMediaType } from "@/lib/postMedia";
import {
  getVideoDurationSeconds,
  isVideoLongerThanMaxSeconds,
  MAX_TRIM_CLIP_SECONDS,
  normalizeVideoDurationSeconds,
} from "@/lib/videoTrim";

export function createMediaEditorItem(
  file: File,
  mediaType: MediaEditorMediaType,
  options?: {
    /**
     * Native-captured video only: the `Capacitor.convertFileSrc` webPath for
     * the file still on disk. When present, this becomes `previewUrl` (the
     * WKWebView media pipeline streams it directly, with proper byte-range
     * support, instead of the app holding the whole decoded file as a
     * `blob:` URL in memory) and a `blob:` URL built from `file` is kept as
     * `fallbackPreviewUrl` in case the native source fails to load.
     */
    nativeWebPath?: string;
  }
): MediaEditorItem {
  const nativeWebPath = options?.nativeWebPath;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    mediaType,
    previewUrl: nativeWebPath || URL.createObjectURL(file),
    fallbackPreviewUrl: nativeWebPath ? URL.createObjectURL(file) : null,
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

export function createPanoramaMediaEditorItem(file: File): MediaEditorItem {
  return {
    ...createMediaEditorItem(file, "image"),
    isPanorama: true,
  };
}

export function revokeMediaEditorItem(item: MediaEditorItem) {
  // previewUrl may be a native capacitor:// webPath rather than a blob: URL —
  // revoking that would be a no-op at best, so only revoke actual blob URLs.
  if (item.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(item.previewUrl);
  }

  if (item.fallbackPreviewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(item.fallbackPreviewUrl);
  }

  if (item.coverPreviewUrl) {
    URL.revokeObjectURL(item.coverPreviewUrl);
  }
}

export function revokeMediaEditorItems(items: MediaEditorItem[]) {
  for (const item of items) {
    revokeMediaEditorItem(item);
  }
}

/** Camera / gallery: attach a measured duration so publish validation uses real seconds. */
export async function withMeasuredVideoDuration(item: MediaEditorItem): Promise<MediaEditorItem> {
  if (item.mediaType !== "video") {
    return item;
  }

  const duration = normalizeVideoDurationSeconds(await getVideoDurationSeconds(item.file).catch(() => 0));

  console.log("[Video duration] media item", {
    fileName: item.file.name,
    detectedDurationSeconds: duration,
    maxAllowedSeconds: MAX_TRIM_CLIP_SECONDS,
  });

  if (duration <= 0) {
    return {
      ...item,
      trimConfirmed: true,
    };
  }

  return {
    ...item,
    sourceDuration: duration,
    trimStart: 0,
    trimEnd: duration,
    trimConfirmed: true,
  };
}

/** Gallery picks: photo or video, same as the camera. */
export async function createGalleryMediaEditorItem(file: File): Promise<MediaEditorItem | null> {
  const mediaType = getPostMediaType(file);

  if (mediaType !== "image" && mediaType !== "video") {
    return null;
  }

  return createMediaEditorItem(file, mediaType);
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
