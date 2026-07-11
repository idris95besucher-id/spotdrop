import { getCollectionSpotThumbnail } from "@/lib/collectionPreview";
import type { ProfileContentPost } from "@/lib/profileContent";
import { supabase } from "@/lib/supabaseClient";

const PREVIEW_SELECT =
  "id, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type";

export async function loadChannelPreviewThumbnails(channelId: string, limit = 4): Promise<string[]> {
  const { data: links, error: linksError } = await supabase
    .from("channel_items")
    .select("post_id, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (linksError || !links?.length) {
    return [];
  }

  const postIds = links.map((row) => String(row.post_id)).filter(Boolean);

  if (postIds.length === 0) {
    return [];
  }

  const { data: posts, error: postsError } = await supabase.from("posts").select(PREVIEW_SELECT).in("id", postIds);

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
      } satisfies Pick<
        ProfileContentPost,
        "image_url" | "video_url" | "video_cover_url" | "thumbnail_url" | "media_url" | "media_type"
      >,
    ])
  );

  const thumbnails: string[] = [];

  for (const postId of postIds) {
    const post = postsById.get(postId);

    if (!post) {
      continue;
    }

    const thumbnail = getCollectionSpotThumbnail(post);

    if (thumbnail) {
      thumbnails.push(thumbnail);
    }
  }

  return thumbnails;
}

export async function loadChannelsPreviewMap(channelIds: string[]) {
  const entries = await Promise.all(
    channelIds.map(async (channelId) => {
      const previews = await loadChannelPreviewThumbnails(channelId);
      return [channelId, previews] as const;
    })
  );

  return Object.fromEntries(entries) as Record<string, string[]>;
}
