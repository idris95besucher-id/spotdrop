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
     * WKWebView media pipeline streams it directly).
     */
    nativeWebPath?: string;
    /** Absolute filesystem path — enables native URLSession upload (no JS File bytes). */
    nativeFilePath?: string;
    /** On-disk byte size from the native recorder. */
    nativeFileSizeBytes?: number;
  }
): MediaEditorItem {
  const nativeWebPath = options?.nativeWebPath;
  const nativeFilePath = options?.nativeFilePath ?? null;
  const nativeFileSizeBytes = options?.nativeFileSizeBytes ?? null;
  // Native video stubs have file.size === 0 — never build a blob: fallback from them.
  const canBuildBlobFallback = !nativeFilePath && file.size > 0;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    mediaType,
    nativeFilePath,
    nativeFileSizeBytes,
    previewUrl: nativeWebPath || URL.createObjectURL(file),
    fallbackPreviewUrl:
      nativeWebPath && canBuildBlobFallback ? URL.createObjectURL(file) : null,
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

  // Native disk videos use a zero-byte stub File — probe the streaming webPath instead,
  // never createObjectURL on an empty stub / never FileReader the mov into memory.
  const durationSource =
    item.nativeFilePath && item.previewUrl ? item.previewUrl : item.file.size > 0 ? item.file : item.previewUrl;

  const duration = normalizeVideoDurationSeconds(
    await getVideoDurationSeconds(durationSource).catch(() => 0)
  );

  console.log("[Video duration] media item", {
    fileName: item.file.name,
    nativeFilePath: item.nativeFilePath ?? null,
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
