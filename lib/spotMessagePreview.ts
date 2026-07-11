import type { I18nLocale } from "@/lib/i18n/locales";
import {
  formatPostDetailLocation,
  formatPostDetailSpotTitle,
  loadPostDetail,
  type PostDetailRow,
} from "@/lib/postDetail";
import { isDemoPostId, normalizePostId } from "@/lib/postIds";
import { getPostMedia, getPostThumbnailUrl } from "@/lib/posts";
import { getViewerSpotMediaUrl, type ViewerPostListItem } from "@/lib/postViewer";
import { normalizeSpotPublicStats } from "@/lib/spotRanking";

export type SpotMessagePreview = {
  postId: string;
  spotName: string | null;
  locationLabel: string | null;
  thumbnailUrl: string | null;
  isVideo: boolean;
};

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
    audio_muted: post.audio_muted,
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

/**
 * Load a Spot for chat / map overlays using the same detail query + normalizer
 * as PostDetailView / PostViewerSlide (`loadPostDetail`).
 */
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

  const result = await loadPostDetail(normalizedId);

  if (result.error || !result.post) {
    return {
      preview: null as SpotMessagePreview | null,
      viewerItem: null as ViewerPostListItem | null,
      error: result.error || "Spot unavailable.",
    };
  }

  return {
    preview: buildSpotMessagePreview(result.post, locale),
    viewerItem: postDetailToViewerItem(result.post),
    error: null as string | null,
  };
}
