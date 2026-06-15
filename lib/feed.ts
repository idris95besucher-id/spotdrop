import { loadExplorePublicCollections } from "@/lib/collections";
import type { PostMediaFields } from "@/lib/posts";
import { isExplorePublishedSpot } from "@/lib/publishedToSpots";
import { isMissingSpotRankingColumns, normalizeSpotPublicStats, type SpotPublicStats } from "@/lib/spotRanking";
import { hasSpotPublishLocation } from "@/lib/spotPublish";
import { formatSpotLocationDisplay } from "@/lib/spotLocationDisplay";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { logExactLoadError } from "@/lib/safeLoad";
import { supabase } from "@/lib/supabaseClient";

export type FeedSpotProfile = {
  username: string;
  avatar_url?: string | null;
  is_private: boolean;
  is_demo: boolean;
};

export type FeedSpotRow = PostMediaFields & {
  id: string;
  user_id: string;
  content: string;
  visibility?: "public" | "private";
  published_to_spots?: boolean | null;
  content_kind?: string | null;
  created_at: string;
  visited_count?: number;
  comments_count?: number;
  collection_save_count?: number;
  saved_count?: number;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  spot_address?: string | null;
  spot_city?: string | null;
  spot_country?: string | null;
  spot_name?: string | null;
  discovery_place_id?: string | null;
  profiles: FeedSpotProfile;
  discovery_places?: { name?: string } | { name?: string }[] | null;
};

const FEED_SPOT_SELECT = `
  id,
  user_id,
  content,
  content_kind,
  image_url,
  video_url,
  video_cover_url,
  thumbnail_url,
  media_url,
  media_type,
  visibility,
  published_to_spots,
  visited_count,
  comments_count,
  collection_save_count,
  created_at,
  spot_latitude,
  spot_longitude,
  spot_address,
  spot_city,
  spot_country,
  spot_name,
  discovery_place_id,
  discovery_places ( name ),
  profiles!posts_user_id_fkey!inner (
    username,
    avatar_url,
    is_private,
    is_demo
  )
`;

const FEED_SPOT_SELECT_NO_THUMBNAIL = `
  id,
  user_id,
  content,
  content_kind,
  image_url,
  video_url,
  media_url,
  media_type,
  visibility,
  published_to_spots,
  visited_count,
  comments_count,
  collection_save_count,
  created_at,
  spot_latitude,
  spot_longitude,
  spot_address,
  spot_city,
  spot_country,
  spot_name,
  discovery_place_id,
  discovery_places ( name ),
  profiles!posts_user_id_fkey!inner (
    username,
    avatar_url,
    is_private,
    is_demo
  )
`;

function isMissingVideoCoverColumn(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" &&
    (message.includes("video_cover_url") || message.includes("thumbnail_url"))
  );
}

function isMissingSpotColumns(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" || message.includes("spot_") || message.includes("content_kind");
}

function isRealUserProfile(profile: FeedSpotProfile) {
  return !profile.is_demo && !isGuideAccountUsername(profile.username);
}

export function isFeedSpotPost(post: Pick<FeedSpotRow, "content_kind">) {
  return post.content_kind === "spot";
}

export function formatFeedSpotTitle(post: FeedSpotRow) {
  return post.spot_name?.trim() || null;
}

export function formatFeedSpotLocation(post: FeedSpotRow) {
  const placeJoin = post.discovery_places;
  const placeName = Array.isArray(placeJoin) ? placeJoin[0]?.name : placeJoin?.name;

  return formatSpotLocationDisplay({
    spot_name: post.spot_name,
    spot_address: post.spot_address,
    spot_city: post.spot_city,
    spot_country: post.spot_country,
    spot_latitude: post.spot_latitude,
    spot_longitude: post.spot_longitude,
    placeName: placeName ?? null,
  });
}

function mapFeedSpotRow(row: Record<string, unknown>): FeedSpotRow {
  const profile = row.profiles as FeedSpotProfile;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    content: String(row.content ?? ""),
    visibility: row.visibility as FeedSpotRow["visibility"],
    published_to_spots: row.published_to_spots as boolean | null | undefined,
    content_kind: (row.content_kind as string | null) ?? null,
    created_at: String(row.created_at),
    media_url: (row.media_url as string | null) ?? null,
    media_type: (row.media_type as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    video_cover_url: (row.video_cover_url as string | null) ?? null,
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    spot_latitude: row.spot_latitude != null ? Number(row.spot_latitude) : null,
    spot_longitude: row.spot_longitude != null ? Number(row.spot_longitude) : null,
    spot_address: (row.spot_address as string | null) ?? null,
    spot_city: (row.spot_city as string | null) ?? null,
    spot_country: (row.spot_country as string | null) ?? null,
    spot_name: (row.spot_name as string | null) ?? null,
    discovery_place_id: (row.discovery_place_id as string | null) ?? null,
    discovery_places: row.discovery_places as FeedSpotRow["discovery_places"],
    ...normalizeSpotPublicStats({
      visited_count: row.visited_count as number | null | undefined,
      comments_count: row.comments_count as number | null | undefined,
      collection_save_count: row.collection_save_count as number | null | undefined,
    }),
    profiles: {
      ...profile,
      username: publicProfileUsername(profile.username),
    },
  };
}

function filterFeedSpots(rows: FeedSpotRow[]) {
  return rows.filter(
    (post) =>
      isExplorePublishedSpot(post) &&
      isRealUserProfile(post.profiles) &&
      isFeedSpotPost(post) &&
      hasSpotPublishLocation(post)
  );
}

async function querySpotFeed(
  select: string,
  options: { limit?: number; offset?: number; rankByScore?: boolean } = {}
) {
  const { limit = 60, offset = 0, rankByScore = true } = options;

  let query = supabase
    .from("posts")
    .select(select)
    .eq("content_kind", "spot")
    .eq("visibility", "public")
    .eq("published_to_spots", true)
    .eq("profiles.is_private", false)
    .eq("profiles.is_demo", false);

  if (rankByScore) {
    query = query.order("spot_rank_score", { ascending: false });
  }

  return query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
}

export function getFeedSpotPublicStats(
  post: Pick<FeedSpotRow, "visited_count" | "comments_count" | "collection_save_count" | "saved_count">
): SpotPublicStats {
  return normalizeSpotPublicStats(post);
}

export async function loadExploreFeed(): Promise<{
  posts: FeedSpotRow[];
  collections: Awaited<ReturnType<typeof loadExplorePublicCollections>>["collections"];
  error: string | null;
}> {
  const [postsResult, collectionsResult] = await Promise.all([loadFeedPosts(), loadExplorePublicCollections()]);

  return {
    posts: postsResult.posts,
    collections: collectionsResult.collections,
    error: postsResult.error ?? collectionsResult.error,
  };
}

export const EXPLORE_PAGE_SIZE = 18;

async function loadSpotFeedPage(
  offset: number,
  limit: number
): Promise<{ posts: FeedSpotRow[]; error: string | null; hasMore: boolean }> {
  let rankByScore = true;
  let result = await querySpotFeed(FEED_SPOT_SELECT, { limit, offset, rankByScore });

  if (result.error && isMissingSpotRankingColumns(result.error)) {
    rankByScore = false;
    result = await querySpotFeed(FEED_SPOT_SELECT, { limit, offset, rankByScore: false });
  }

  if (isMissingSpotColumns(result.error)) {
    result = await querySpotFeed(FEED_SPOT_SELECT_NO_THUMBNAIL, { limit, offset, rankByScore });
  }

  if (isMissingVideoCoverColumn(result.error)) {
    result = await querySpotFeed(FEED_SPOT_SELECT_NO_THUMBNAIL, { limit, offset, rankByScore });
  }

  if (result.error) {
    logExactLoadError(result.error);
    return { posts: [], error: result.error.message || "Unable to load spots.", hasMore: false };
  }

  const mapped = (result.data ?? []).map((row) => mapFeedSpotRow(row as unknown as Record<string, unknown>));
  const posts = filterFeedSpots(mapped);

  return {
    posts,
    error: null,
    hasMore: posts.length >= limit,
  };
}

export async function loadExploreSpotPostsPage(
  offset = 0,
  limit = EXPLORE_PAGE_SIZE
): Promise<{ posts: FeedSpotRow[]; error: string | null; hasMore: boolean }> {
  return loadSpotFeedPage(offset, limit);
}

export async function loadFeedPosts(): Promise<{
  posts: FeedSpotRow[];
  error: string | null;
}> {
  const result = await loadSpotFeedPage(0, 60);
  return { posts: result.posts, error: result.error };
}
