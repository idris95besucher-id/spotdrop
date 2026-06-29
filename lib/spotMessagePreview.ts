import type { I18nLocale } from "@/lib/i18n/locales";
import {
  formatPostDetailLocation,
  formatPostDetailSpotTitle,
  type PostDetailRow,
} from "@/lib/postDetail";
import { isDemoPostId, normalizePostId, postIdForQuery } from "@/lib/postIds";
import { getPostMedia, getPostThumbnailUrl, POST_AUTHOR_PROFILES_FKEY } from "@/lib/posts";
import { getViewerSpotMediaUrl, type ViewerPostListItem } from "@/lib/postViewer";
import { normalizeSpotPublicStats } from "@/lib/spotRanking";
import { supabase } from "@/lib/supabaseClient";

export type SpotMessagePreview = {
  postId: string;
  spotName: string | null;
  locationLabel: string | null;
  thumbnailUrl: string | null;
  isVideo: boolean;
};

const SPOT_PREVIEW_SELECT =
  `id, user_id, content, created_at, content_kind, spot_name, spot_address, spot_city, spot_country, spot_latitude, spot_longitude, image_url, video_url, media_url, media_type, video_cover_url, thumbnail_url, visited_count, comments_count, collection_save_count, ${POST_AUTHOR_PROFILES_FKEY}(username, avatar_url)`;

const SPOT_PREVIEW_SELECT_LEGACY =
  "id, user_id, content, created_at, content_kind, spot_name, spot_address, spot_city, spot_country, spot_latitude, spot_longitude, image_url, video_url, media_url, media_type, video_cover_url, thumbnail_url, visited_count, comments_count, collection_save_count";

export function postDetailToViewerItem(post: PostDetailRow): ViewerPostListItem {
  const id = normalizePostId(post.id)!;

  return {
    id,
    user_id: post.user_id,
    content: post.content,
    created_at: post.created_at,
    content_kind: post.content_kind,
    image_url: post.image_url,
    video_url: post.video_url,
    video_cover_url: post.video_cover_url,
    thumbnail_url: post.thumbnail_url,
    media_url: post.media_url,
    media_type: post.media_type,
    spot_name: post.spot_name,
    spot_address: post.spot_address,
    spot_city: post.spot_city,
    spot_country: post.spot_country,
    spot_latitude: post.spot_latitude,
    spot_longitude: post.spot_longitude,
    visibility: post.visibility ?? null,
    ...normalizeSpotPublicStats(post),
    profiles: post.profiles ?? null,
  };
}

export function buildSpotMessagePreview(post: PostDetailRow, locale: I18nLocale = "en"): SpotMessagePreview {
  const media = getPostMedia(post);

  return {
    postId: normalizePostId(post.id) ?? String(post.id),
    spotName: formatPostDetailSpotTitle(post),
    locationLabel: formatPostDetailLocation(post, locale),
    thumbnailUrl: getPostThumbnailUrl(post) ?? getViewerSpotMediaUrl(post),
    isVideo: media.mediaType === "video",
  };
}

export async function loadSpotMessagePreview(postId: string, locale: I18nLocale = "en") {
  const normalizedId = normalizePostId(postId);

  if (!normalizedId) {
    return {
      preview: null as SpotMessagePreview | null,
      viewerItem: null as ViewerPostListItem | null,
      error: "Spot unavailable.",
    };
  }

  if (isDemoPostId(normalizedId)) {
    return {
      preview: null as SpotMessagePreview | null,
      viewerItem: null as ViewerPostListItem | null,
      error: "Spot unavailable.",
    };
  }

  const queryId = postIdForQuery(normalizedId);

  let result = await supabase.from("posts").select(SPOT_PREVIEW_SELECT).eq("id", queryId).maybeSingle();

  if (result.error?.code === "42703") {
    result = await supabase.from("posts").select(SPOT_PREVIEW_SELECT_LEGACY).eq("id", queryId).maybeSingle();
  }

  if (result.error) {
    return {
      preview: null as SpotMessagePreview | null,
      viewerItem: null as ViewerPostListItem | null,
      error: result.error.message || "Spot unavailable.",
    };
  }

  if (!result.data) {
    return {
      preview: null as SpotMessagePreview | null,
      viewerItem: null as ViewerPostListItem | null,
      error: "Spot unavailable.",
    };
  }

  const raw = result.data as PostDetailRow & {
    id: string | number;
    profiles?: PostDetailRow["profiles"] | NonNullable<PostDetailRow["profiles"]>[];
  };
  const profile = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles;
  const post: PostDetailRow = {
    ...raw,
    id: normalizePostId(raw.id) ?? normalizedId,
    profiles: profile ?? null,
  };

  return {
    preview: buildSpotMessagePreview(post, locale),
    viewerItem: postDetailToViewerItem(post),
    error: null as string | null,
  };
}
