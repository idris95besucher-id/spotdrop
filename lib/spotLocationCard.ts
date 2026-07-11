import { DEFAULT_SPOT_NAME } from "@/lib/spotPublish";
import {
  formatSpotLocationShort,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";
import type { I18nLocale } from "@/lib/i18n/locales";

/** Stored in posts.content to identify generated SpotDrop location cards. */
export const SPOT_LOCATION_CARD_MARKER = "spot_location_card";

/** Canvas export size — 1080×1350 (4:5). */
export const SPOT_LOCATION_CARD_ASPECT = 1080 / 1350;

const SPOT_LOCATION_CARD_ASPECT_TOLERANCE = 0.02;

export function spotLocationCardContent() {
  return SPOT_LOCATION_CARD_MARKER;
}

export function hasLocationCardContentMarker(content: string | null | undefined) {
  const normalized = (content ?? "").trim();

  if (!normalized) {
    return false;
  }

  return (
    normalized === SPOT_LOCATION_CARD_MARKER ||
    normalized.includes(SPOT_LOCATION_CARD_MARKER) ||
    normalized.includes("\u2063spot_location_card")
  );
}

export function isDeclaredLocationCardSpot(
  post: Pick<
    SpotLocationCardDetectPost & { card_type?: string | null },
    "content_kind" | "media_type" | "card_type"
  >
) {
  const mediaType = (post.media_type ?? "").trim().toLowerCase();
  const contentKind = (post.content_kind ?? "").trim().toLowerCase();
  const cardType = (post.card_type ?? "").trim().toLowerCase();

  return (
    mediaType === "location_card" ||
    contentKind === "location_card" ||
    cardType === "location"
  );
}

export type SpotLocationCardDetectPost = Pick<
  SpotLocationDisplayFields & {
    content?: string | null;
    media_type?: string | null;
    video_url?: string | null;
  },
  | "content"
  | "content_kind"
  | "media_type"
  | "video_url"
  | "spot_name"
  | "spot_address"
  | "spot_city"
  | "spot_country"
>;

export type SpotLocationCardDetectOptions = {
  carouselItemCount?: number;
  /** naturalWidth / naturalHeight once the primary image has loaded. */
  mediaAspectRatio?: number | null;
};

function isSpotVideoMedia(post: Pick<SpotLocationCardDetectPost, "media_type" | "video_url">) {
  if (post.video_url?.trim()) {
    return true;
  }

  const mediaType = post.media_type?.trim().toLowerCase() ?? "";

  return mediaType.includes("video");
}

export function hasSpotLocationCardAspect(mediaAspectRatio: number | null | undefined) {
  if (!mediaAspectRatio || !Number.isFinite(mediaAspectRatio)) {
    return false;
  }

  return Math.abs(mediaAspectRatio - SPOT_LOCATION_CARD_ASPECT) <= SPOT_LOCATION_CARD_ASPECT_TOLERANCE;
}

export function isSpotLocationCardPost(
  post: SpotLocationCardDetectPost,
  options: SpotLocationCardDetectOptions = {}
) {
  if (post.content_kind !== "spot" || isSpotVideoMedia(post)) {
    return false;
  }

  if (options.carouselItemCount && options.carouselItemCount > 1) {
    return false;
  }

  const content = post.content?.trim() ?? "";

  if (hasLocationCardContentMarker(content)) {
    return true;
  }

  if (content) {
    return false;
  }

  return hasSpotLocationCardAspect(options.mediaAspectRatio);
}

/** Text-only generated location cards — hidden from Search explore grid only. */
export function isTextOnlyLocationCardSpot(
  post: Pick<
    SpotLocationCardDetectPost & { card_type?: string | null },
    "content" | "content_kind" | "media_type" | "video_url" | "card_type"
  >
) {
  if (isDeclaredLocationCardSpot(post)) {
    return true;
  }

  if (post.content_kind !== "spot" || isSpotVideoMedia(post)) {
    return false;
  }

  return hasLocationCardContentMarker(post.content);
}

/** Caption under a location card — hide location duplicates and empty defaults. */
export function getSpotLocationCardViewerTitle(
  post: Pick<
    SpotLocationCardDetectPost,
    "spot_name" | "spot_address" | "spot_city" | "spot_country"
  >,
  locale: I18nLocale
) {
  const title = post.spot_name?.trim();

  if (!title || title === DEFAULT_SPOT_NAME) {
    return null;
  }

  const shortLocation = formatSpotLocationShort(
    {
      spot_city: post.spot_city,
      spot_country: post.spot_country,
      spot_address: post.spot_address,
    },
    locale
  );

  if (shortLocation && title === shortLocation) {
    return null;
  }

  const address = post.spot_address?.trim();

  if (address && (title === address || title.includes(address))) {
    return null;
  }

  return title;
}

export function probeImageAspectRatio(url: string | null | undefined): Promise<number | null> {
  if (typeof window === "undefined" || !url?.trim()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(image.naturalWidth / image.naturalHeight);
        return;
      }

      resolve(null);
    };

    image.onerror = () => resolve(null);
    image.src = url;
  });
}
