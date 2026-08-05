import { inferMediaTypeFromUrl } from "@/lib/posts";
import type { PostCarouselMediaSummary } from "@/lib/postMediaItems";
import {
  hasLocationCardContentMarker,
  isDeclaredLocationCardSpot,
} from "@/lib/spotLocationCard";

export type SearchExploreSpotPost = {
  id: string;
  content: string;
  content_kind?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  card_type?: string | null;
};

export type { PostCarouselMediaSummary };

/** Spot has photo or video suitable for a visual Search grid tile. */
export function hasRealVisualSpotMedia(
  post: Pick<
    SearchExploreSpotPost,
    "media_url" | "media_type" | "image_url" | "video_url" | "content_kind"
  > & { card_type?: string | null }
) {
  if (isDeclaredLocationCardSpot(post)) {
    return false;
  }

  const mediaType = (post.media_type ?? "").trim().toLowerCase();

  if (post.video_url?.trim()) {
    return true;
  }

  if (mediaType.includes("video")) {
    return true;
  }

  const mediaUrl = post.media_url?.trim() || post.image_url?.trim();

  if (!mediaUrl) {
    return false;
  }

  if (mediaType === "image" || mediaType.includes("image") || mediaType === "photo") {
    return true;
  }

  if (post.content_kind === "spot" && mediaUrl) {
    return true;
  }

  return inferMediaTypeFromUrl(mediaUrl) !== null;
}

const GENERATED_LOCATION_CARD_WIDTH = 1080;
const GENERATED_LOCATION_CARD_HEIGHT = 1350;

export function shouldProbeLegacyTextCard(
  post: SearchExploreSpotPost,
  carousel?: PostCarouselMediaSummary
) {
  if (hasLocationCardContentMarker(post.content) || isDeclaredLocationCardSpot(post)) {
    return false;
  }

  if (carousel?.hasVideo || (carousel && carousel.itemCount > 1)) {
    return false;
  }

  const mediaType = (post.media_type ?? "").trim().toLowerCase();

  if (post.video_url?.trim() || mediaType.includes("video")) {
    return false;
  }

  const content = post.content?.trim() ?? "";

  if (content) {
    return false;
  }

  return Boolean(post.media_url?.trim() || post.image_url?.trim());
}

const LEGACY_CARD_PROBE_TIMEOUT_MS = 4_000;

export async function probeLegacyGeneratedLocationCardImage(mediaUrl: string | null) {
  if (!mediaUrl || typeof window === "undefined") {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };

    const timeoutId = window.setTimeout(() => finish(false), LEGACY_CARD_PROBE_TIMEOUT_MS);

    image.onload = () => {
      finish(
        image.naturalWidth === GENERATED_LOCATION_CARD_WIDTH &&
          image.naturalHeight === GENERATED_LOCATION_CARD_HEIGHT
      );
    };

    image.onerror = () => finish(false);
    image.src = mediaUrl;
  });
}

function isTextCardHideReason(
  post: SearchExploreSpotPost,
  carousel?: PostCarouselMediaSummary
) {
  if (isDeclaredLocationCardSpot(post)) {
    return true;
  }

  if (hasLocationCardContentMarker(post.content)) {
    return true;
  }

  if (carousel?.hasVideo) {
    return false;
  }

  if (carousel && carousel.itemCount > 1) {
    return false;
  }

  const mediaType = (post.media_type ?? "").trim().toLowerCase();

  if (post.video_url?.trim() || mediaType.includes("video")) {
    return false;
  }

  if (!hasRealVisualSpotMedia(post)) {
    return true;
  }

  return false;
}

/** Hide generated text-only location cards from Search explore grid. */
export function shouldHideFromSearchExploreGrid(
  post: SearchExploreSpotPost,
  carousel?: PostCarouselMediaSummary
) {
  return isTextCardHideReason(post, carousel);
}

export function filterSearchExploreGridPosts<T extends SearchExploreSpotPost>(
  rows: T[],
  carouselByPostId: Map<string, PostCarouselMediaSummary>
) {
  const beforeCount = rows.length;
  let textCardsHidden = 0;

  const kept = rows.filter((post) => {
    const carousel = carouselByPostId.get(post.id);

    if (!shouldHideFromSearchExploreGrid(post, carousel)) {
      return true;
    }

    if (isTextCardHideReason(post, carousel)) {
      textCardsHidden += 1;
    }

    return false;
  });

  console.log("[Search grid] filtered text cards", {
    before: beforeCount,
    after: kept.length,
    textCardsHidden,
  });

  return kept;
}
