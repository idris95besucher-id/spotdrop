import {
  isCityRoomImageMessage,
  parseCityRoomImageMessage,
  type CityRoomImagePayload,
} from "@/lib/cityRoomImageMessage";
import {
  parseLocationCardShareMessage,
  type LocationCardSharePayload,
} from "@/lib/locationCardShareMessage";

export type CityRoomPlacePayload = {
  name: string;
  address: string;
  description: string | null;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  region: string | null;
  country: string | null;
};

export const CITY_ROOM_PLACE_MARKER = "[[spotdrop_place]]";

export function encodeCityRoomPlaceMessage(place: CityRoomPlacePayload) {
  return `${CITY_ROOM_PLACE_MARKER}${JSON.stringify({
    v: 1,
    name: place.name,
    address: place.address,
    description: place.description,
    imageUrl: place.imageUrl,
    latitude: place.latitude,
    longitude: place.longitude,
    city: place.city,
    country: place.country,
    region: place.region,
  })}`;
}

export type CityRoomMessageContent =
  | { kind: "text"; text: string }
  | { kind: "place"; place: CityRoomPlacePayload }
  | { kind: "image"; image: CityRoomImagePayload }
  | { kind: "location_card"; card: LocationCardSharePayload };

export function parseCityRoomMessageContent(content: string): CityRoomMessageContent {
  const trimmed = content.trim();

  const locationCard = parseLocationCardShareMessage(trimmed);
  if (locationCard) {
    return { kind: "location_card", card: locationCard };
  }

  const image = parseCityRoomImageMessage(trimmed);
  if (image) {
    return { kind: "image", image };
  }

  if (!trimmed.startsWith(CITY_ROOM_PLACE_MARKER)) {
    return { kind: "text", text: content };
  }

  try {
    const raw = JSON.parse(trimmed.slice(CITY_ROOM_PLACE_MARKER.length)) as {
      v?: number;
      name?: string;
      address?: string;
      description?: string | null;
      imageUrl?: string | null;
      latitude?: number;
      longitude?: number;
      city?: string | null;
      country?: string | null;
      region?: string | null;
    };

    const latitude = Number(raw.latitude);
    const longitude = Number(raw.longitude);
    const name = raw.name?.trim();
    const address = raw.address?.trim();

    if (!name || !address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { kind: "text", text: content };
    }

    return {
      kind: "place",
      place: {
        name,
        address,
        description: raw.description?.trim() || null,
        imageUrl: raw.imageUrl?.trim() || null,
        latitude,
        longitude,
        city: raw.city?.trim() || null,
        country: raw.country?.trim() || null,
        region: raw.region?.trim() || null,
      },
    };
  } catch {
    return { kind: "text", text: content };
  }
}

export function isCityRoomPlaceMessage(content: string) {
  return parseCityRoomMessageContent(content).kind === "place";
}

export function isCityRoomStructuredMessage(content: string) {
  const parsed = parseCityRoomMessageContent(content);
  return parsed.kind === "place" || parsed.kind === "image" || parsed.kind === "location_card";
}

export { isCityRoomImageMessage };

export function buildPlaceMapsUrl(place: Pick<CityRoomPlacePayload, "latitude" | "longitude" | "name">) {
  const query = encodeURIComponent(`${place.latitude},${place.longitude} (${place.name})`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function placeSearchHitToPayload(hit: {
  name: string;
  address: string;
  description: string | null;
  imageUrl?: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  region?: string | null;
}): CityRoomPlacePayload {
  return {
    name: hit.name,
    address: hit.address,
    description: hit.description,
    imageUrl: hit.imageUrl ?? null,
    latitude: hit.latitude,
    longitude: hit.longitude,
    city: hit.city,
    country: hit.country,
    region: hit.region ?? null,
  };
}
