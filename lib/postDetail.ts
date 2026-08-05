import { isGuideAccountProfile } from "@/lib/guideAccounts";
import { CLIENT_DEMO_FEED_POSTS } from "@/lib/demoFeed";
import type { GuidePlace } from "@/lib/guidePlaces";
import type { PostMediaFields } from "@/lib/posts";
import { POST_AUTHOR_PROFILES_FKEY } from "@/lib/posts";
import type { I18nLocale } from "@/lib/i18n/locales";
import { formatSpotLocationDisplay } from "@/lib/spotLocationDisplay";
import { isDemoPostId, normalizePostId, postIdForQuery } from "@/lib/postIds";
import {
  getCachedPostDetail,
  getPostDetailInFlight,
  setCachedPostDetail,
  setPostDetailInFlight,
} from "@/lib/postDetailCache";
import { logExactLoadError, userFacingSupabaseListError } from "@/lib/safeLoad";
import {
  logSpotLoadQueryResult,
  logSpotLoadQueryStart,
  logSpotLoadUiFailure,
} from "@/lib/spotLoadDiagnostics";
import { supabase } from "@/lib/supabaseClient";

export type PostDetailRow = PostMediaFields & {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  content_kind?: string | null;
  spot_name?: string | null;
  spot_address?: string | null;
  spot_city?: string | null;
  spot_country?: string | null;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  visibility?: "public" | "private" | null;
  visited_count?: number;
  comments_count?: number;
  collection_save_count?: number;
  unique_view_count?: number;
  profiles?: {
    username: string;
    avatar_url?: string | null;
    is_verified?: boolean | null;
  } | null;
  guide_places?: GuidePlace | GuidePlace[] | null;
};

export function formatPostDetailLocation(post: PostDetailRow, locale: I18nLocale = "en") {
  return formatSpotLocationDisplay(
    {
      content_kind: post.content_kind,
      spot_name: post.spot_name,
      spot_address: post.spot_address,
      spot_city: post.spot_city,
      spot_country: post.spot_country,
      spot_latitude: post.spot_latitude,
      spot_longitude: post.spot_longitude,
    },
    locale
  );
}

export function formatPostDetailSpotTitle(post: PostDetailRow) {
  return post.spot_name?.trim() || null;
}

export function findDemoPost(postId: string): PostDetailRow | null {
  const demo = CLIENT_DEMO_FEED_POSTS.find((post) => post.id === postId);

  if (!demo) {
    return null;
  }

  return {
    id: demo.id,
    user_id: demo.user_id,
    content: demo.content,
    created_at: demo.created_at,
    image_url: demo.image_url ?? null,
    video_url: demo.video_url ?? null,
    media_url: demo.media_url ?? null,
    media_type: demo.media_type ?? null,
  };
}

const POST_DETAIL_SELECT = `id, user_id, content, created_at, updated_at, visibility, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, content_kind, spot_name, spot_address, spot_city, spot_country, spot_latitude, spot_longitude, visited_count, comments_count, collection_save_count, unique_view_count, guide_places(title, location_name, canton, city, description, opening_hours, price_info, official_url, read_more_text, media_url, media_type, source_url), ${POST_AUTHOR_PROFILES_FKEY}(username, avatar_url, is_verified)`;

const POST_DETAIL_SELECT_NO_UNIQUE_VIEWS = POST_DETAIL_SELECT.replace(", unique_view_count", "");

const POST_DETAIL_SELECT_NO_RANKING = POST_DETAIL_SELECT_NO_UNIQUE_VIEWS.replace(
  ", visited_count, comments_count, collection_save_count",
  ""
);

function isMissingSpotRankingInSelect(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" &&
    (message.includes("visited_count") ||
      message.includes("comments_count") ||
      message.includes("collection_save_count"))
  );
}

function isMissingUniqueViewCountInSelect(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" && message.includes("unique_view_count");
}

function isMissingGuidePlacesJoin(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" || message.includes("guide_places");
}

function mapPostDetailRow(row: Record<string, unknown>, normalizedId: string): PostDetailRow {
  const profileJoin = row.profiles as PostDetailRow["profiles"] | PostDetailRow["profiles"][] | null | undefined;
  const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;

  return {
    ...(row as PostDetailRow),
    id: normalizePostId(row.id) ?? normalizedId,
    profiles: profile ?? null,
    guide_places: row.guide_places as PostDetailRow["guide_places"],
  };
}

async function queryPostDetail(queryId: string, normalizedId: string) {
  let result = await supabase.from("posts").select(POST_DETAIL_SELECT).eq("id", queryId).maybeSingle();

  if (result.error && isMissingUniqueViewCountInSelect(result.error)) {
    result = await supabase.from("posts").select(POST_DETAIL_SELECT_NO_UNIQUE_VIEWS).eq("id", queryId).maybeSingle();
  }

  if (result.error && isMissingSpotRankingInSelect(result.error)) {
    result = await supabase.from("posts").select(POST_DETAIL_SELECT_NO_RANKING).eq("id", queryId).maybeSingle();
  }

  if (result.error && isMissingGuidePlacesJoin(result.error)) {
    result = await supabase
      .from("posts")
      .select(
        `id, user_id, content, created_at, updated_at, visibility, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, content_kind, spot_name, spot_address, spot_city, spot_country, spot_latitude, spot_longitude, ${POST_AUTHOR_PROFILES_FKEY}(username, avatar_url)`
      )
      .eq("id", queryId)
      .maybeSingle();
  }

  return result;
}

export async function loadPostDetail(postId: string): Promise<{
  post: PostDetailRow | null;
  error: string | null;
  isDemo: boolean;
}> {
  const normalizedId = normalizePostId(postId);

  if (!normalizedId) {
    logSpotLoadUiFailure("loadPostDetail", "invalid spotId before query", {
      receivedSpotId: postId,
      normalizedId: null,
    });
    return { post: null, error: "Post not found.", isDemo: false };
  }

  const cached = getCachedPostDetail(normalizedId);

  if (cached) {
    return cached;
  }

  const inFlight = getPostDetailInFlight(normalizedId);

  if (inFlight) {
    return inFlight;
  }

  const loadPromise = (async (): Promise<{
    post: PostDetailRow | null;
    error: string | null;
    isDemo: boolean;
  }> => {
    if (isDemoPostId(normalizedId)) {
      const demoPost = findDemoPost(normalizedId);
      const result = {
        post: demoPost,
        error: demoPost ? null : "Post not found.",
        isDemo: true,
      };

      if (demoPost) {
        setCachedPostDetail(normalizedId, demoPost, true);
      }

      return result;
    }

    try {
      const queryId = postIdForQuery(normalizedId);
      logSpotLoadQueryStart("loadPostDetail", normalizedId, queryId);

      const { data, error } = await queryPostDetail(String(queryId), normalizedId);

      logSpotLoadQueryResult({
        context: "loadPostDetail",
        receivedSpotId: normalizedId,
        queryId,
        data: data as PostDetailRow | null,
        error,
        select: POST_DETAIL_SELECT,
      });

      if (error) {
        logExactLoadError(error);
        return { post: null, error: userFacingSupabaseListError(error) ?? "Unable to load this post.", isDemo: false };
      }

      if (!data) {
        logSpotLoadUiFailure("loadPostDetail", "no row after successful query", {
          receivedSpotId: normalizedId,
          queryId,
        });
        return { post: null, error: "Post not found.", isDemo: false };
      }

      const row = mapPostDetailRow(data as Record<string, unknown>, normalizedId);

      if (isGuideAccountProfile(row.profiles ?? {})) {
        logSpotLoadUiFailure("loadPostDetail", "post author is guide account — hidden", {
          receivedSpotId: normalizedId,
          queryId,
          userId: row.user_id,
        });
        return { post: null, error: "Post not found.", isDemo: false };
      }

      setCachedPostDetail(normalizedId, row, false);

      return {
        post: row,
        error: null,
        isDemo: false,
      };
    } catch (error) {
      logExactLoadError(error);
      const message = error instanceof Error ? error.message : "Unable to load this post.";
      return { post: null, error: message, isDemo: false };
    }
  })();

  setPostDetailInFlight(normalizedId, loadPromise);

  return loadPromise;
}
