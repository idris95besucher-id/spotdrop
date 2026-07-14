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
    };
  } catch {
    return null;
  }
}

export function isCityRoomMapMarkMessage(content: string) {
  return parseCityRoomMapMarkMessage(content) != null;
}

export function buildMapMarkDeepLink(mapMarkId: string) {
  const id = mapMarkId.trim();
  return `/visit?tab=map&mark=${encodeURIComponent(id)}`;
}
