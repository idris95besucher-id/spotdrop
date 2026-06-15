export const CITY_ROOM_IMAGE_MARKER = "[[spotdrop_image]]";

export type CityRoomImagePayload = {
  imageUrl: string;
  alt: string | null;
};

export function encodeCityRoomImageMessage(image: CityRoomImagePayload) {
  return `${CITY_ROOM_IMAGE_MARKER}${JSON.stringify({
    v: 1,
    imageUrl: image.imageUrl,
    alt: image.alt,
  })}`;
}

export function parseCityRoomImageMessage(content: string): CityRoomImagePayload | null {
  const trimmed = content.trim();

  if (!trimmed.startsWith(CITY_ROOM_IMAGE_MARKER)) {
    return null;
  }

  try {
    const raw = JSON.parse(trimmed.slice(CITY_ROOM_IMAGE_MARKER.length)) as {
      v?: number;
      imageUrl?: string;
      alt?: string | null;
    };

    const imageUrl = raw.imageUrl?.trim();

    if (!imageUrl) {
      return null;
    }

    return {
      imageUrl,
      alt: raw.alt?.trim() || null,
    };
  } catch {
    return null;
  }
}

export function isCityRoomImageMessage(content: string) {
  return parseCityRoomImageMessage(content) !== null;
}
