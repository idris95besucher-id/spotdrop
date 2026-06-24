import type { ProfileContentPost } from "@/lib/profileContent";
import { supabase } from "@/lib/supabaseClient";

const PREVIEW_SELECT =
  "id, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type";

type CollectionSpotMediaRow = Pick<
  ProfileContentPost,
  "image_url" | "video_url" | "video_cover_url" | "thumbnail_url" | "media_url" | "media_type"
>;

/** Thumbnail URL for collection mosaic tiles (video uses cover, not the video file). */
export function getCollectionSpotThumbnail(post: CollectionSpotMediaRow): string | null {
  const isVideo = post.media_type === "video" || Boolean(post.video_url);

  if (isVideo) {
    return post.video_cover_url ?? post.thumbnail_url ?? post.image_url ?? null;
  }

  return post.thumbnail_url ?? post.image_url ?? post.media_url ?? null;
}

export async function loadCollectionPreviewThumbnails(
  collectionId: string,
  limit = 4
): Promise<string[]> {
  const { data: links, error: linksError } = await supabase
    .from("collection_spots")
    .select("post_id, created_at")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (linksError || !links?.length) {
    return [];
  }

  const postIds = links.map((row) => String(row.post_id));

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(PREVIEW_SELECT)
    .in("id", postIds);

  if (postsError || !posts?.length) {
    return [];
  }

  const postsById = new Map(
    posts.map((row) => [
      String(row.id),
      {
        image_url: (row.image_url as string | null) ?? null,
        video_url: (row.video_url as string | null) ?? null,
        video_cover_url: (row.video_cover_url as string | null) ?? null,
        thumbnail_url: (row.thumbnail_url as string | null) ?? null,
        media_url: (row.media_url as string | null) ?? null,
        media_type: (row.media_type as string | null) ?? null,
      } satisfies CollectionSpotMediaRow,
    ])
  );

  const thumbnails: string[] = [];

  for (const link of links) {
    const post = postsById.get(String(link.post_id));
    if (!post) {
      continue;
    }

    const thumbnail = getCollectionSpotThumbnail(post);
    if (thumbnail) {
      thumbnails.push(thumbnail);
    }
  }

  return thumbnails.slice(0, limit);
}

export async function loadCollectionsPreviewMap(collectionIds: string[]) {
  if (collectionIds.length === 0) {
    return {} as Record<string, string[]>;
  }

  const entries = await Promise.all(
    collectionIds.map(async (collectionId) => {
      const thumbnails = await loadCollectionPreviewThumbnails(collectionId);
      return [collectionId, thumbnails] as const;
    })
  );

  return Object.fromEntries(entries) as Record<string, string[]>;
}
