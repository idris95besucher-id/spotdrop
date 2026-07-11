import { SPOT_LOCATION_CARD_MARKER } from "@/lib/spotLocationCard";
import { loadExplorePublicCollections } from "@/lib/collections";
import { loadPostCarouselMediaSummaries } from "@/lib/postMediaItems";
import {
  filterSearchExploreGridPosts,
  probeLegacyGeneratedLocationCardImage,
  shouldProbeLegacyTextCard,
} from "@/lib/searchExploreGrid";
import type { PostMediaFields } from "@/lib/posts";
import { isExplorePublishedSpot } from "@/lib/publishedToSpots";
import { isMissingSpotRankingColumns, normalizeSpotPublicStats, type SpotPublicStats } from "@/lib/spotRanking";
import { hasSpotPublishLocation } from "@/lib/spotPublish";
import type { I18nLocale } from "@/lib/i18n/locales";
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

export function formatFeedSpotLocation(post: FeedSpotRow, locale: I18nLocale = "en") {
  const placeJoin = post.discovery_places;
  const placeName = Array.isArray(placeJoin) ? placeJoin[0]?.name : placeJoin?.name;

  return formatSpotLocationDisplay(
    {
      spot_name: post.spot_name,
      spot_address: post.spot_address,
      spot_city: post.spot_city,
      spot_country: post.spot_country,
      spot_latitude: post.spot_latitude,
      spot_longitude: post.spot_longitude,
      placeName: placeName ?? null,
    },
    locale
  );
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

function filterFeedSpots(rows: FeedSpotRow[], logContext?: string) {
  const kept: FeedSpotRow[] = [];

  for (const post of rows) {
    if (!isExplorePublishedSpot(post)) {
      if (logContext) {
        console.warn("[Search Grid] hidden/filtered spot reason", {
          postId: post.id,
          reason: "not_explore_published",
        });
      }
      continue;
    }

    if (!isRealUserProfile(post.profiles)) {
      if (logContext) {
        console.warn("[Search Grid] hidden/filtered spot reason", {
          postId: post.id,
          reason: "guide_or_demo_profile",
        });
      }
      continue;
    }

    if (!isFeedSpotPost(post)) {
      if (logContext) {
        console.warn("[Search Grid] hidden/filtered spot reason", {
          postId: post.id,
          reason: "not_spot_content_kind",
        });
      }
      continue;
    }

    if (!hasSpotPublishLocation(post)) {
      if (logContext) {
        console.warn("[Search Grid] hidden/filtered spot reason", {
          postId: post.id,
          reason: "missing_publish_location",
        });
      }
      continue;
    }

    kept.push(post);
  }

  if (logContext) {
    console.log("[Search Grid] visible spots count", kept.length, `(from ${rows.length} fetched)`);
  }

  return kept;
}

async function filterSearchExploreSpots(rows: FeedSpotRow[]) {
  const base = filterFeedSpots(rows, "search-explore");
  const carouselByPostId = await loadPostCarouselMediaSummaries(base.map((post) => post.id));
  const markedFiltered = filterSearchExploreGridPosts(base, carouselByPostId);

  const kept: FeedSpotRow[] = [];
  let legacyGeneratedCards = 0;

  for (const post of markedFiltered) {
    const carousel = carouselByPostId.get(post.id);

    if (!shouldProbeLegacyTextCard(post, carousel)) {
      kept.push(post);
      continue;
    }

    const mediaUrl = post.media_url?.trim() || post.image_url?.trim() || null;
    const isGeneratedCard = await probeLegacyGeneratedLocationCardImage(mediaUrl);

    if (isGeneratedCard) {
      legacyGeneratedCards += 1;
      continue;
    }

    kept.push(post);
  }

  if (legacyGeneratedCards > 0) {
    console.log("[Search grid] filtered text cards", {
      legacyGeneratedCards,
      afterLegacyProbe: kept.length,
    });
  }

  return kept;
}

/** Merge incoming feed rows without dropping existing posts (stable Search grid). */
export function mergeFeedSpotPosts(existing: FeedSpotRow[], incoming: FeedSpotRow[]) {
  if (existing.length === 0) {
    return incoming;
  }

  const byId = new Map(existing.map((post) => [post.id, post]));

  for (const post of incoming) {
    const prior = byId.get(post.id);
    byId.set(post.id, prior ? { ...prior, ...post } : post);
  }

  const seen = new Set<string>();
  const merged: FeedSpotRow[] = [];

  for (const post of existing) {
    const next = byId.get(post.id);
    if (next) {
      merged.push(next);
      seen.add(post.id);
    }
  }

  for (const post of incoming) {
    if (!seen.has(post.id)) {
      merged.push(post);
    }
  }

  return merged;
}

async function querySpotFeed(
  select: string,
  options: { limit?: number; offset?: number; rankByScore?: boolean; searchExplore?: boolean } = {}
) {
  const { limit = 60, offset = 0, rankByScore = true, searchExplore = false } = options;

  let query = supabase
    .from("posts")
    .select(select)
    .eq("content_kind", "spot")
    .eq("visibility", "public")
    .eq("published_to_spots", true)
    .eq("profiles.is_private", false)
    .eq("profiles.is_demo", false);

  if (searchExplore) {
    query = query.not("content", "ilike", `%${SPOT_LOCATION_CARD_MARKER}%`);
  }

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
  limit: number,
  options: { rankByScore?: boolean; logContext?: string } = {}
): Promise<{ posts: FeedSpotRow[]; error: string | null; hasMore: boolean; fetchedCount: number }> {
  const { rankByScore = true, logContext } = options;
  let useRankByScore = rankByScore;
  let result = await querySpotFeed(FEED_SPOT_SELECT, {
    limit,
    offset,
    rankByScore: useRankByScore,
    searchExplore: logContext === "search-explore",
  });

  if (result.error && isMissingSpotRankingColumns(result.error)) {
    useRankByScore = false;
    result = await querySpotFeed(FEED_SPOT_SELECT, {
      limit,
      offset,
      rankByScore: false,
      searchExplore: logContext === "search-explore",
    });
  }

  if (isMissingSpotColumns(result.error)) {
    result = await querySpotFeed(FEED_SPOT_SELECT_NO_THUMBNAIL, {
      limit,
      offset,
      rankByScore: useRankByScore,
      searchExplore: logContext === "search-explore",
    });
  }

  if (isMissingVideoCoverColumn(result.error)) {
    result = await querySpotFeed(FEED_SPOT_SELECT_NO_THUMBNAIL, {
      limit,
      offset,
      rankByScore: useRankByScore,
      searchExplore: logContext === "search-explore",
    });
  }

  if (result.error) {
    logExactLoadError(result.error);
    return { posts: [], error: result.error.message || "Unable to load spots.", hasMore: false, fetchedCount: 0 };
  }

  const rawRows = result.data ?? [];
  if (logContext) {
    console.log("[Search Grid] fetched spots count", rawRows.length, { offset, limit });
  }

  const mapped = rawRows.map((row) => mapFeedSpotRow(row as unknown as Record<string, unknown>));
  const posts =
    logContext === "search-explore"
      ? await filterSearchExploreSpots(mapped)
      : filterFeedSpots(mapped, logContext);

  return {
    posts,
    error: null,
    hasMore: rawRows.length >= limit,
    fetchedCount: rawRows.length,
  };
}

export async function loadExploreSpotPostsPage(
  offset = 0,
  limit = EXPLORE_PAGE_SIZE
): Promise<{ posts: FeedSpotRow[]; error: string | null; hasMore: boolean; fetchedCount: number }> {
  const visible: FeedSpotRow[] = [];
  let dbOffset = offset;
  let fetchedCount = 0;
  let hasMore = true;
  let error: string | null = null;

  for (let batch = 0; batch < 4 && visible.length < limit && hasMore; batch += 1) {
    const result = await loadSpotFeedPage(dbOffset, limit, {
      rankByScore: false,
      logContext: "search-explore",
    });

    if (result.error) {
      error = result.error;
      break;
    }

    visible.push(...result.posts);
    fetchedCount += result.fetchedCount;
    dbOffset += result.fetchedCount;
    hasMore = result.hasMore;

    if (result.fetchedCount === 0) {
      break;
    }
  }

  if (error && visible.length === 0) {
    return { posts: [], error, hasMore: false, fetchedCount };
  }

  return {
    posts: visible.slice(0, limit),
    error: null,
    hasMore: hasMore || visible.length > limit,
    fetchedCount,
  };
}

export async function loadFeedPosts(): Promise<{
  posts: FeedSpotRow[];
  error: string | null;
}> {
  const result = await loadSpotFeedPage(0, 60);
  return { posts: result.posts, error: result.error };
}

function filterFollowingFeedPosts(rows: FeedSpotRow[]) {
  return rows.filter((post) => {
    if (post.content_kind === "story") {
      return false;
    }

    if (!isRealUserProfile(post.profiles)) {
      return false;
    }

    if (isFeedSpotPost(post)) {
      return isExplorePublishedSpot(post);
    }

    const kind = post.content_kind?.trim();

    if (kind === "spot") {
      return false;
    }

    return true;
  });
}

async function queryFollowingFeedPosts(followingIds: string[], select: string) {
  return supabase
    .from("posts")
    .select(select)
    .in("user_id", followingIds)
    .eq("visibility", "public")
    .neq("content_kind", "story")
    .order("created_at", { ascending: false })
    .limit(80);
}

export async function loadFollowingFeed(viewerId: string | null | undefined): Promise<{
  posts: FeedSpotRow[];
  error: string | null;
}> {
  if (!viewerId) {
    return { posts: [], error: null };
  }

  const { data: followingRows, error: followsError } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId);

  if (followsError) {
    logExactLoadError(followsError);
    return { posts: [], error: followsError.message || "Unable to load friends feed." };
  }

  const followingIds = [...new Set((followingRows ?? []).map((row) => String(row.following_id)).filter(Boolean))];

  if (followingIds.length === 0) {
    return { posts: [], error: null };
  }

  let select = FEED_SPOT_SELECT;
  let queryResult = await queryFollowingFeedPosts(followingIds, select);

  if (queryResult.error && isMissingSpotColumns(queryResult.error)) {
    select = FEED_SPOT_SELECT_NO_THUMBNAIL;
    queryResult = await queryFollowingFeedPosts(followingIds, select);
  }

  if (isMissingVideoCoverColumn(queryResult.error)) {
    select = FEED_SPOT_SELECT_NO_THUMBNAIL;
    queryResult = await queryFollowingFeedPosts(followingIds, select);
  }

  if (queryResult.error) {
    logExactLoadError(queryResult.error);
    return { posts: [], error: queryResult.error.message || "Unable to load friends feed." };
  }

  const mapped = (queryResult.data ?? []).map((row) => mapFeedSpotRow(row as unknown as Record<string, unknown>));

  return {
    posts: filterFollowingFeedPosts(mapped),
    error: null,
  };
}
