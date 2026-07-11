import { loadPostMediaCarouselItems } from "@/lib/postMediaItems";

export type GridFlipPreviewMedia = {
  photoUrl: string;
  videoUrl: string;
  videoPoster: string | null;
};

const flipPreviewCache = new Map<string, GridFlipPreviewMedia | null>();

export function getCachedGridFlipPreviewMedia(postId: string) {
  if (!flipPreviewCache.has(postId)) {
    return undefined;
  }

  return flipPreviewCache.get(postId) ?? null;
}

export async function loadGridFlipPreviewMedia(postId: string): Promise<GridFlipPreviewMedia | null> {
  const cached = getCachedGridFlipPreviewMedia(postId);

  if (cached !== undefined) {
    return cached;
  }

  const items = await loadPostMediaCarouselItems(postId);

  if (
    items.length < 2 ||
    items[0]?.media_type !== "image" ||
    items[1]?.media_type !== "video"
  ) {
    flipPreviewCache.set(postId, null);
    return null;
  }

  const media: GridFlipPreviewMedia = {
    photoUrl: items[0].media_url,
    videoUrl: items[1].media_url,
    videoPoster: items[1].video_cover_url,
  };

  flipPreviewCache.set(postId, media);
  return media;
}
