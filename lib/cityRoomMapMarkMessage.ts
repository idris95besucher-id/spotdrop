import {
  DEFAULT_MAP_MARK_CATEGORY,
  normalizeMapMarkCategory,
  type MapMarkCategoryKey,
} from "@/lib/mapMarkCategories";

export const CITY_ROOM_MAP_MARK_MARKER = "[[spotdrop_map_mark]]";

export type CityRoomMapMarkPayload = {
  mapMarkId: string;
  category: MapMarkCategoryKey;
  text: string;
  photoUrl: string | null;
  municipality: string | null;
  /** First-level admin region (canton / state / Bundesland / …) */
  regionName: string | null;
  countryName: string | null;
  /** @deprecated Prefer regionName — kept for older room messages */
  cantonName: string | null;
  placeName: string | null;
  latitude: number;
  longitude: number;
  /**
   * The Mark's original author — denormalized at share time so the card always credits the
   * creator, even when a different member forwards the Mark into a DM/group/room. Optional
   * because older room messages (auto-shared before this field existed) don't carry it; card
   * renderers fall back to the message's own sender profile in that case.
   */
  creatorUserId: string | null;
  creatorUsername: string | null;
  creatorAvatarUrl: string | null;
};

export function encodeCityRoomMapMarkMessage(payload: CityRoomMapMarkPayload) {
  const regionName = payload.regionName?.trim() || payload.cantonName?.trim() || null;

  return `${CITY_ROOM_MAP_MARK_MARKER}${JSON.stringify({
    v: 1,
    mapMarkId: payload.mapMarkId,
    category: payload.category,
    text: payload.text,
    photoUrl: payload.photoUrl,
    municipality: payload.municipality,
    regionName,
    cantonName: regionName,
    countryName: payload.countryName,
    placeName: payload.placeName,
    latitude: payload.latitude,
    longitude: payload.longitude,
    creatorUserId: payload.creatorUserId,
    creatorUsername: payload.creatorUsername,
    creatorAvatarUrl: payload.creatorAvatarUrl,
  })}`;
}

export function parseCityRoomMapMarkMessage(content: string): CityRoomMapMarkPayload | null {
  const trimmed = content.trim();

  if (!trimmed.startsWith(CITY_ROOM_MAP_MARK_MARKER)) {
    return null;
  }

  try {
    const raw = JSON.parse(trimmed.slice(CITY_ROOM_MAP_MARK_MARKER.length)) as {
      mapMarkId?: string;
      category?: string;
      text?: string;
      photoUrl?: string | null;
      municipality?: string | null;
      regionName?: string | null;
      countryName?: string | null;
      cantonName?: string | null;
      placeName?: string | null;
      latitude?: number;
      longitude?: number;
      creatorUserId?: string | null;
      creatorUsername?: string | null;
      creatorAvatarUrl?: string | null;
    };

    const mapMarkId = raw.mapMarkId?.trim();
    const text = raw.text?.trim();
    const latitude = Number(raw.latitude);
    const longitude = Number(raw.longitude);

    if (!mapMarkId || !text || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const regionName = raw.regionName?.trim() || raw.cantonName?.trim() || null;

    return {
      mapMarkId,
      category: normalizeMapMarkCategory(raw.category) || DEFAULT_MAP_MARK_CATEGORY,
      text,
      photoUrl: raw.photoUrl?.trim() || null,
      municipality: raw.municipality?.trim() || null,
      regionName,
      countryName: raw.countryName?.trim() || null,
      cantonName: regionName,
      placeName: raw.placeName?.trim() || null,
      latitude,
      longitude,
      creatorUserId: raw.creatorUserId?.trim() || null,
      creatorUsername: raw.creatorUsername?.trim() || null,
      creatorAvatarUrl: raw.creatorAvatarUrl?.trim() || null,
    };
  } catch {
    return null;
  }
}

export function isCityRoomMapMarkMessage(content: string) {
  return parseCityRoomMapMarkMessage(content) != null;
}

/** Builds a shareable payload straight from a loaded MapMark — used whenever a Mark is sent (auto-share to its region room, or an explicit Share to DM/group/room). */
export function mapMarkToSharePayload(mark: {
  id: string;
  category: MapMarkCategoryKey;
  text: string;
  photo_url: string | null;
  municipality: string | null;
  region_name: string | null;
  country_slug: string | null;
  place_name: string | null;
  latitude: number;
  longitude: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
}): CityRoomMapMarkPayload {
  return {
    mapMarkId: mark.id,
    category: normalizeMapMarkCategory(mark.category),
    text: mark.text,
    photoUrl: mark.photo_url,
    municipality: mark.municipality,
    regionName: mark.region_name,
    cantonName: mark.region_name,
    countryName: mark.country_slug,
    placeName: mark.place_name,
    latitude: mark.latitude,
    longitude: mark.longitude,
    creatorUserId: mark.user_id,
    creatorUsername: mark.username,
    creatorAvatarUrl: mark.avatar_url,
  };
}

export function buildMapMarkDeepLink(mapMarkId: string) {
  const id = mapMarkId.trim();
  return `/visit?tab=map&mark=${encodeURIComponent(id)}`;
}
