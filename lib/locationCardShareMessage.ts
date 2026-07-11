import type { SpotLocationCardFontStyle } from "@/lib/spotLocationCardStyles";
import { spotLocationCardContent } from "@/lib/spotLocationCard";
import type { ViewerPostListItem } from "@/lib/postViewer";

export const LOCATION_CARD_SHARE_MARKER = "[[spotdrop_location_card]]";

export type LocationCardSharePayload = {
  imageUrl: string;
  cardText: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  fontStyle: SpotLocationCardFontStyle;
};

export function encodeLocationCardShareMessage(payload: LocationCardSharePayload) {
  return `${LOCATION_CARD_SHARE_MARKER}${JSON.stringify({
    v: 1,
    imageUrl: payload.imageUrl,
    cardText: payload.cardText,
    locationLabel: payload.locationLabel,
    latitude: payload.latitude,
    longitude: payload.longitude,
    fontStyle: payload.fontStyle,
  })}`;
}

export function parseLocationCardShareMessage(content: string): LocationCardSharePayload | null {
  const trimmed = content.trim();

  if (!trimmed.startsWith(LOCATION_CARD_SHARE_MARKER)) {
    return null;
  }

  try {
    const raw = JSON.parse(trimmed.slice(LOCATION_CARD_SHARE_MARKER.length)) as {
      v?: number;
      imageUrl?: string;
      cardText?: string;
      locationLabel?: string;
      latitude?: number;
      longitude?: number;
      fontStyle?: SpotLocationCardFontStyle;
    };

    const imageUrl = raw.imageUrl?.trim();
    const cardText = raw.cardText?.trim() ?? "";
    const locationLabel = raw.locationLabel?.trim();
    const latitude = Number(raw.latitude);
    const longitude = Number(raw.longitude);

    if (!imageUrl || !locationLabel || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      imageUrl,
      cardText,
      locationLabel,
      latitude,
      longitude,
      fontStyle: raw.fontStyle ?? "classic",
    };
  } catch {
    return null;
  }
}

export function isLocationCardShareMessage(content: string | null | undefined) {
  return parseLocationCardShareMessage(content ?? "") !== null;
}

export function locationCardSharePayloadToViewerItem(
  card: LocationCardSharePayload,
  userId: string,
  options?: { postId?: string; createdAt?: string }
): ViewerPostListItem {
  return {
    id: options?.postId ?? `shared-location-card-${card.imageUrl}`,
    user_id: userId,
    content: spotLocationCardContent(),
    created_at: options?.createdAt ?? new Date().toISOString(),
    content_kind: "spot",
    media_url: card.imageUrl,
    media_type: "image",
    image_url: card.imageUrl,
    thumbnail_url: card.imageUrl,
    video_cover_url: card.imageUrl,
    spot_name: card.cardText.trim() || null,
    spot_address: card.locationLabel,
    spot_city: null,
    spot_country: null,
    spot_latitude: card.latitude,
    spot_longitude: card.longitude,
    visibility: "private",
    visited_count: 0,
    comments_count: 0,
    collection_save_count: 0,
    profiles: null,
  };
}
