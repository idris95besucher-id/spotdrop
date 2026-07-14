import { normalizePostId, postIdForQuery } from "@/lib/postIds";
import type { ProfileContentPost } from "@/lib/profileContent";
import { formatSpotLocationDisplay } from "@/lib/spotLocationDisplay";
import { normalizeSpotPublicStats } from "@/lib/spotRanking";
import { dispatchSpotStatsUpdated } from "@/lib/spotStatsEvents";
import { toUserFacingError } from "@/lib/userFacingError";
import { supabase } from "@/lib/supabaseClient";

export const SPOT_SAVE_CHANGED_EVENT = "spotdrop:spot-save-changed";

export type SpotSaveChangedDetail = {
  postId: string;
  saved: boolean;
  savedCount?: number;
};

function dispatchSpotSaveChanged(detail: SpotSaveChangedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(SPOT_SAVE_CHANGED_EVENT, { detail }));
}

const SAVED_POST_SELECT =
  "id, user_id, content, visibility, published_to_spots, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, updated_at, discovery_place_id, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, visited_count, comments_count, collection_save_count";

export async function isSpotSavedByUser(userId: string, postId: string) {
  const queryId = postIdForQuery(postId);

  const { data, error } = await supabase
    .from("spot_collection_saves")
    .select("post_id")
    .eq("user_id", userId)
    .eq("post_id", queryId)
    .maybeSingle();

  if (error) {
    return { saved: false, error: toUserFacingError(error, "Unable to load save state.") };
  }

  return { saved: Boolean(data), error: null as string | null };
}

export async function toggleSpotSave(userId: string, postId: string) {
  const queryId = postIdForQuery(postId);
  const normalizedId = normalizePostId(postId) ?? String(postId);

  const current = await isSpotSavedByUser(userId, postId);

  if (current.error) {
    return { saved: false, error: current.error };
  }

  if (current.saved) {
    const { error } = await supabase
      .from("spot_collection_saves")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", queryId);

    if (error) {
      return { saved: true, error: toUserFacingError(error, "Unable to unsave this spot.") };
    }

    const { data: postRow } = await supabase
      .from("posts")
      .select("collection_save_count")
      .eq("id", queryId)
      .maybeSingle();

    const savedCount = Math.max(0, Number(postRow?.collection_save_count ?? 0) || 0);
    dispatchSpotStatsUpdated({
      postId: normalizedId,
      saved_count: savedCount,
    });
    dispatchSpotSaveChanged({ postId: normalizedId, saved: false, savedCount });

    return { saved: false, error: null as string | null, savedCount };
  }

  const { error } = await supabase.from("spot_collection_saves").insert({
    user_id: userId,
    post_id: queryId,
  });

  if (error) {
    // Unique violation — treat as already saved
    if (error.code === "23505") {
      dispatchSpotSaveChanged({ postId: normalizedId, saved: true });
      return { saved: true, error: null as string | null };
    }

    return { saved: false, error: toUserFacingError(error, "Unable to save this spot.") };
  }

  const { data: postRow } = await supabase
    .from("posts")
    .select("collection_save_count")
    .eq("id", queryId)
    .maybeSingle();

  const savedCount = Math.max(0, Number(postRow?.collection_save_count ?? 0) || 0);
  dispatchSpotStatsUpdated({
    postId: normalizedId,
    saved_count: savedCount,
  });
  dispatchSpotSaveChanged({ postId: normalizedId, saved: true, savedCount });

  return { saved: true, error: null as string | null, savedCount };
}

function mapSavedPostRow(row: Record<string, unknown>): ProfileContentPost {
  const stats = normalizeSpotPublicStats(row as never);
  const post: ProfileContentPost = {
    id: String(row.id),
    user_id: String(row.user_id),
    content: typeof row.content === "string" ? row.content : "",
    visibility: (row.visibility as ProfileContentPost["visibility"]) ?? null,
    published_to_spots: (row.published_to_spots as boolean | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    video_cover_url: (row.video_cover_url as string | null) ?? null,
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    media_url: (row.media_url as string | null) ?? null,
    media_type: (row.media_type as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: (row.updated_at as string | null) ?? undefined,
    discovery_place_id: row.discovery_place_id != null ? String(row.discovery_place_id) : null,
    content_kind: (row.content_kind as string | null) ?? null,
    spot_name: (row.spot_name as string | null) ?? null,
    spot_latitude: (row.spot_latitude as number | null) ?? null,
    spot_longitude: (row.spot_longitude as number | null) ?? null,
    spot_address: (row.spot_address as string | null) ?? null,
    spot_city: (row.spot_city as string | null) ?? null,
    spot_country: (row.spot_country as string | null) ?? null,
    visited_count: stats.visited_count,
    comments_count: stats.comments_count,
    collection_save_count: stats.saved_count,
    saved_count: stats.saved_count,
  };

  post.location_label = formatSpotLocationDisplay({
    spot_name: post.spot_name,
    spot_address: post.spot_address,
    spot_city: post.spot_city,
    spot_country: post.spot_country,
  });

  return post;
}

/** Owner-only saved grid: newest save first. */
export async function loadUserSavedSpots(userId: string) {
  const { data: saves, error: savesError } = await supabase
    .from("spot_collection_saves")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (savesError) {
    return {
      posts: [] as ProfileContentPost[],
      error: toUserFacingError(savesError, "Unable to load saved spots."),
    };
  }

  const postIds = (saves ?? [])
    .map((row) => row.post_id)
    .filter((id): id is string | number => id != null);

  if (postIds.length === 0) {
    return { posts: [] as ProfileContentPost[], error: null as string | null };
  }

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(SAVED_POST_SELECT)
    .in("id", postIds)
    .eq("content_kind", "spot");

  if (postsError) {
    return {
      posts: [] as ProfileContentPost[],
      error: toUserFacingError(postsError, "Unable to load saved spots."),
    };
  }

  const byId = new Map(
    (posts ?? []).map((row) => [String((row as { id: unknown }).id), row as Record<string, unknown>])
  );

  const ordered: ProfileContentPost[] = [];

  for (const id of postIds) {
    const row = byId.get(String(id));

    if (row) {
      ordered.push(mapSavedPostRow(row));
    }
  }

  return { posts: ordered, error: null as string | null };
}
