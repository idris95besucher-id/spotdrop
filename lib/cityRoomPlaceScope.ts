import type { CityRoomPlaceSearchScope } from "@/lib/touristPlaceSearch";
import { resolveCityRoomPlaceSearchScope } from "@/lib/touristPlaces";

const scopeCache = new Map<string, CityRoomPlaceSearchScope>();

function scopeCacheKey(input: {
  countrySlug: string;
  citySlug: string;
  cityName: string;
  countryName: string;
}) {
  return `${input.countrySlug}:${input.citySlug}:${input.cityName}:${input.countryName}`.toLowerCase();
}

async function geocodeCityRoomScope(input: {
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
}): Promise<CityRoomPlaceSearchScope | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", `${input.cityName}, ${input.countryName}`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "SpotDrop/1.0 (city-room-place-search)",
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    address?: Record<string, string | undefined>;
  }>;

  const latitude = Number.parseFloat(data[0]?.lat ?? "");
  const longitude = Number.parseFloat(data[0]?.lon ?? "");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const address = data[0]?.address;

  return {
    countrySlug: input.countrySlug,
    countryName: input.countryName,
    citySlug: input.citySlug,
    cityName: input.cityName,
    region: input.region ?? address?.state ?? address?.region ?? address?.county ?? null,
    latitude,
    longitude,
    searchRadiusKm: 18,
  };
}

async function geocodeCountryCenter(countryName: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", countryName);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "SpotDrop/1.0 (city-room-place-search)",
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const latitude = Number.parseFloat(data[0]?.lat ?? "");
  const longitude = Number.parseFloat(data[0]?.lon ?? "");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export async function resolveCityRoomScope(input: {
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
}): Promise<CityRoomPlaceSearchScope | null> {
  const cacheKey = scopeCacheKey(input);
  const cached = scopeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const knownScope = resolveCityRoomPlaceSearchScope(input);
  const scope = knownScope ?? (await geocodeCityRoomScope(input));

  if (scope) {
    scopeCache.set(cacheKey, scope);
  }

  return scope;
}

export async function resolveCountryFallbackScope(
  scope: CityRoomPlaceSearchScope
): Promise<CityRoomPlaceSearchScope> {
  const center = await geocodeCountryCenter(scope.countryName);

  if (!center) {
    return {
      ...scope,
      searchRadiusKm: Math.max(scope.searchRadiusKm * 2.5, 80),
    };
  }

  return {
    ...scope,
    latitude: center.latitude,
    longitude: center.longitude,
    searchRadiusKm: Math.max(scope.searchRadiusKm * 3, 120),
  };
}
