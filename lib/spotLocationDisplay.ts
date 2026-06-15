export type SpotLocationDisplayFields = {
  id?: string | null;
  content_kind?: string | null;
  spot_name?: string | null;
  spot_address?: string | null;
  spot_city?: string | null;
  spot_country?: string | null;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  placeName?: string | null;
};

function uniqueLocationParts(parts: Array<string | null | undefined>) {
  const result: string[] = [];

  for (const part of parts) {
    const trimmed = part?.trim();

    if (!trimmed) {
      continue;
    }

    if (result.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      continue;
    }

    result.push(trimmed);
  }

  return result;
}

export function formatSpotLocationDisplay(post: SpotLocationDisplayFields) {
  const parts = uniqueLocationParts([
    post.spot_name,
    post.placeName,
    post.spot_address,
    post.spot_city,
    post.spot_country,
  ]);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return null;
}

/** Instagram-style short location label for spots: "Country, City". */
export function formatSpotLocationShort(post: SpotLocationDisplayFields) {
  const fallbackCity =
    post.spot_city ??
    inferSpotRegionFromAddress({
      address: post.spot_address,
      city: post.spot_city,
      country: post.spot_country,
    }) ??
    post.spot_address?.split(",")[0]?.trim() ??
    null;

  const parts = uniqueLocationParts([post.spot_country, fallbackCity]);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return null;
}

/**
 * Heuristic region/canton inference from a comma-separated address string.
 * Example: "Street, 3011 Bern, Bern, Switzerland" -> "Bern"
 */
export function inferSpotRegionFromAddress(options: {
  address: string | null | undefined;
  city: string | null | undefined;
  country: string | null | undefined;
}) {
  const raw = options.address?.trim();
  if (!raw) {
    return null;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const city = options.city?.trim().toLowerCase() ?? null;
  const country = options.country?.trim().toLowerCase() ?? null;

  const cityIndex = city ? parts.findIndex((part) => part.toLowerCase().includes(city)) : -1;
  const countryIndex = country ? parts.findIndex((part) => part.toLowerCase() === country) : -1;

  const endIndex = countryIndex > 0 ? countryIndex : parts.length;
  const startIndex = cityIndex >= 0 ? cityIndex + 1 : 0;

  const between = parts.slice(startIndex, endIndex).filter(Boolean);

  if (between.length === 0) {
    return null;
  }

  const candidate = between[between.length - 1]!;
  if (candidate && options.city && candidate.toLowerCase().includes(options.city.toLowerCase())) {
    return null;
  }

  return candidate || null;
}

export function hasSpotCoordinates(post: SpotLocationDisplayFields) {
  const latitude = Number(post.spot_latitude);
  const longitude = Number(post.spot_longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

export function hasSpotLocationData(post: SpotLocationDisplayFields) {
  return Boolean(formatSpotLocationDisplay(post) || hasSpotCoordinates(post));
}

export function isSpotContent(post: Pick<SpotLocationDisplayFields, "content_kind" | "spot_latitude" | "spot_longitude">) {
  if (post.content_kind === "story") {
    return false;
  }

  return post.content_kind === "spot" || hasSpotCoordinates(post);
}

export function shouldShowSpotLocation(post: SpotLocationDisplayFields) {
  if (!isSpotContent(post) && post.content_kind && post.content_kind !== "spot") {
    return hasSpotLocationData(post);
  }

  return isSpotContent(post) && hasSpotLocationData(post);
}

export function buildSpotMapsUrl(post: SpotLocationDisplayFields) {
  const latitude = Number(post.spot_latitude);
  const longitude = Number(post.spot_longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  const query = formatSpotLocationDisplay(post);

  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return null;
}
