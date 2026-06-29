import { isGuideAccountProfile } from "@/lib/guideAccounts";
import { CLIENT_DEMO_FEED_POSTS } from "@/lib/demoFeed";
import type { GuidePlace } from "@/lib/guidePlaces";
import type { PostMediaFields } from "@/lib/posts";
import type { I18nLocale } from "@/lib/i18n/locales";
import { formatSpotLocationDisplay } from "@/lib/spotLocationDisplay";
import { isDemoPostId, normalizePostId, postIdForQuery } from "@/lib/postIds";
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
  visited_count?: number;
  comments_count?: number;
  collection_save_count?: number;
  profiles?: {
    username: string;
    avatar_url?: string | null;
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

async function isGuideAccountUserId(userId: string) {
  const { data, error } = await supabase.from("profiles").select("username, name").eq("id", userId).maybeSingle();

  if (error || !data) {
    return false;
  }

  return isGuideAccountProfile(data);
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

  if (isDemoPostId(normalizedId)) {
    const demoPost = findDemoPost(normalizedId);
    return {
      post: demoPost,
      error: demoPost ? null : "Post not found.",
      isDemo: true,
    };
  }

  try {
    const queryId = postIdForQuery(normalizedId);
    logSpotLoadQueryStart("loadPostDetail", normalizedId, queryId);

    const { data, error } = await supabase.from("posts").select("*").eq("id", queryId).single();

    logSpotLoadQueryResult({
      context: "loadPostDetail",
      receivedSpotId: normalizedId,
      queryId,
      data: data as PostDetailRow | null,
      error,
      select: "posts *",
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

    const row = data as PostDetailRow & { id: string | number };

    if (await isGuideAccountUserId(String(row.user_id))) {
      logSpotLoadUiFailure("loadPostDetail", "post author is guide account — hidden", {
        receivedSpotId: normalizedId,
        queryId,
        userId: row.user_id,
      });
      return { post: null, error: "Post not found.", isDemo: false };
    }

    return {
      post: { ...row, id: normalizePostId(row.id) ?? normalizedId },
      error: null,
      isDemo: false,
    };
  } catch (error) {
    logExactLoadError(error);
    const message = error instanceof Error ? error.message : "Unable to load this post.";
    return { post: null, error: message, isDemo: false };
  }
}
