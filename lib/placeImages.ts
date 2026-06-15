import { getMapboxAccessToken } from "@/lib/mapbox";

export function wikimediaCommonsImageUrl(commonsTag: string, width = 480) {
  const fileName = commonsTag.replace(/^File:/i, "").trim();

  if (!fileName) {
    return null;
  }

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;
}

export function mapboxStaticPlaceImageUrl(latitude: number, longitude: number, width = 480, height = 240) {
  const token = getMapboxAccessToken();

  if (!token) {
    return null;
  }

  const pin = `pin-s+14b8a6(${longitude},${latitude})`;
  return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${pin}/${longitude},${latitude},13,0/${width}x${height}@2x?access_token=${encodeURIComponent(token)}`;
}

export function googlePlacePhotoUrl(photoName: string, apiKey: string, maxHeightPx = 400) {
  const params = new URLSearchParams({
    maxHeightPx: String(maxHeightPx),
    key: apiKey,
  });

  return `https://places.googleapis.com/v1/${photoName}/media?${params.toString()}`;
}

function wikipediaTitleFromTag(tag: string) {
  const parts = tag.split(":");

  if (parts.length >= 2) {
    return parts.slice(1).join(":").replace(/_/g, " ");
  }

  return tag.replace(/_/g, " ");
}

export async function fetchWikipediaImageUrl(title: string) {
  const trimmed = title.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(trimmed)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 86400 },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };

    return data.thumbnail?.source ?? data.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

export async function resolvePlaceImageUrl(input: {
  name: string;
  city?: string | null;
  imageUrl?: string | null;
  wikipediaTag?: string | null;
  wikimediaCommons?: string | null;
  latitude: number;
  longitude: number;
}) {
  if (input.imageUrl?.trim()) {
    return input.imageUrl.trim();
  }

  if (input.wikimediaCommons?.trim()) {
    const commonsUrl = wikimediaCommonsImageUrl(input.wikimediaCommons);

    if (commonsUrl) {
      return commonsUrl;
    }
  }

  if (input.wikipediaTag?.trim()) {
    const wikiImage = await fetchWikipediaImageUrl(wikipediaTitleFromTag(input.wikipediaTag));

    if (wikiImage) {
      return wikiImage;
    }
  }

  const wikiSearchTitles = [input.name, input.city ? `${input.name} ${input.city}` : null].filter(Boolean) as string[];

  for (const title of wikiSearchTitles) {
    const wikiImage = await fetchWikipediaImageUrl(title);

    if (wikiImage) {
      return wikiImage;
    }
  }

  return mapboxStaticPlaceImageUrl(input.latitude, input.longitude);
}
