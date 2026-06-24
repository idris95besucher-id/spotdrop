import type { MediaEditorItem, MediaEditorMediaType } from "@/lib/mediaEditor/types";

export function createMediaEditorItem(file: File, mediaType: MediaEditorMediaType): MediaEditorItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    mediaType,
    previewUrl: URL.createObjectURL(file),
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
