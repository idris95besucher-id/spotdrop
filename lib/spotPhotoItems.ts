import {
  revokeMediaEditorItem,
  type MediaEditorItem,
} from "@/lib/mediaEditor";
import { SPOT_MAX_PHOTOS } from "@/lib/spotMaxPhotos";

export function canAddSpotPhoto(items: MediaEditorItem[]): boolean {
  return items.length < SPOT_MAX_PHOTOS;
}

export function appendSpotPhotoItems(
  current: MediaEditorItem[],
  additions: MediaEditorItem[]
): MediaEditorItem[] {
  const combined = [...current, ...additions];
  const kept = combined.slice(0, SPOT_MAX_PHOTOS);

  for (const item of combined.slice(SPOT_MAX_PHOTOS)) {
    revokeMediaEditorItem(item);
  }

  return kept;
}

export function removeSpotPhotoAt(
  items: MediaEditorItem[],
  index: number
): MediaEditorItem[] {
  const removed = items[index];

  if (removed) {
    revokeMediaEditorItem(removed);
  }

  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function moveSpotPhoto(
  items: MediaEditorItem[],
  fromIndex: number,
  toIndex: number
): MediaEditorItem[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}
