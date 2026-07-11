import { postIdForQuery } from "@/lib/postIds";
import { supabase } from "@/lib/supabaseClient";
import { logSpotPublish } from "@/lib/spotPublishProgress";

export type PostMediaCarouselItem = {
  id: string;
  post_id: string;
  sort_order: number;
  media_url: string;
  media_type: "image" | "video";
  video_cover_url: string | null;
  audio_muted: boolean;
};

export type InsertPostMediaCarouselResult = {
  ok: boolean;
  error: string | null;
};

export async function loadPostMediaCarouselItems(postId: string): Promise<PostMediaCarouselItem[]> {
  const { data, error } = await supabase
    .from("post_media_items")
    .select("id, post_id, sort_order, media_url, media_type, video_cover_url, audio_muted")
    .eq("post_id", postIdForQuery(postId))
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "42703") {
      const legacy = await supabase
        .from("post_media_items")
        .select("id, post_id, sort_order, media_url, media_type, video_cover_url")
        .eq("post_id", postIdForQuery(postId))
        .order("sort_order", { ascending: true });

      if (legacy.error) {
        if (legacy.error.code === "42P01") {
          return [];
        }

        console.warn("[postMediaItems] load failed", legacy.error);
        return [];
      }

      return (legacy.data ?? []).map((item) => ({
        ...(item as Omit<PostMediaCarouselItem, "audio_muted">),
        audio_muted: false,
      }));
    }

    console.warn("[postMediaItems] load failed", error);
    return [];
  }

  return (data ?? []).map((item) => ({
    ...(item as Omit<PostMediaCarouselItem, "audio_muted">),
    audio_muted: Boolean((item as { audio_muted?: boolean }).audio_muted),
  }));
}

export type PostCarouselMediaSummary = {
  itemCount: number;
  hasVideo: boolean;
  hasImage: boolean;
};

/** Batch carousel counts for Search explore filtering. */
export async function loadPostCarouselMediaSummaries(
  postIds: string[]
): Promise<Map<string, PostCarouselMediaSummary>> {
  const summaryMap = new Map<string, PostCarouselMediaSummary>();

  if (postIds.length === 0) {
    return summaryMap;
  }

  for (const postId of postIds) {
    summaryMap.set(postId, { itemCount: 0, hasVideo: false, hasImage: false });
  }

  const { data, error } = await supabase
    .from("post_media_items")
    .select("post_id, media_type")
    .in(
      "post_id",
      postIds.map((postId) => postIdForQuery(postId))
    );

  if (error) {
    if (error.code === "42P01") {
      return summaryMap;
    }

    console.warn("[postMediaItems] carousel summary load failed", error);
    return summaryMap;
  }

  for (const row of data ?? []) {
    const postId = String(row.post_id);
    const entry = summaryMap.get(postId) ?? { itemCount: 0, hasVideo: false, hasImage: false };
    entry.itemCount += 1;

    if (row.media_type === "video") {
      entry.hasVideo = true;
    }

    if (row.media_type === "image") {
      entry.hasImage = true;
    }

    summaryMap.set(postId, entry);
  }

  return summaryMap;
}

export async function insertPostMediaCarouselItems(
  postId: string,
  items: Array<{
    mediaUrl: string;
    mediaType: "image" | "video";
    videoCoverUrl?: string | null;
    audioMuted?: boolean;
  }>
): Promise<InsertPostMediaCarouselResult> {
  if (items.length === 0) {
    return { ok: true, error: null };
  }

  const postIdValue = postIdForQuery(postId);

  const rows = items.map((item, index) => ({
    post_id: postIdValue,
    sort_order: index,
    media_url: item.mediaUrl,
    media_type: item.mediaType,
    video_cover_url: item.videoCoverUrl ?? null,
    audio_muted: item.mediaType === "video" ? Boolean(item.audioMuted) : false,
  }));

  logSpotPublish("media items insert start", {
    postId: String(postIdValue),
    itemCount: rows.length,
    sortOrders: rows.map((row) => row.sort_order),
  });

  let { error } = await supabase.from("post_media_items").insert(rows);

  if (error?.code === "42703" && error.message?.toLowerCase().includes("audio_muted")) {
    const legacyRows = rows.map(({ audio_muted: _audioMuted, ...row }) => row);
    ({ error } = await supabase.from("post_media_items").insert(legacyRows));
  }

  if (error) {
    logSpotPublish("media items insert error", {
      postId: String(postIdValue),
      code: error.code,
      message: error.message,
    });

    return {
      ok: false,
      error: error.message || "Unable to save carousel media.",
    };
  }

  logSpotPublish("media items insert success", {
    postId: String(postIdValue),
    itemCount: rows.length,
  });

  return { ok: true, error: null };
}
