export type PlaceSearchHit = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  region: string | null;
  country: string | null;
  imageUrl: string | null;
  wikipediaTag?: string | null;
  wikimediaCommons?: string | null;
};

export type CityRoomPlaceSearchRequest = {
  query?: string;
  limit?: number;
  featured?: boolean;
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
};

export async function searchPlacesForChat(request: CityRoomPlaceSearchRequest) {
  const trimmed = request.query?.trim() ?? "";
  const limit = request.limit ?? 8;
  const featured = request.featured ?? false;

  if (!featured && trimmed.length < 2) {
    return { results: [] as PlaceSearchHit[], error: null as string | null };
  }

  try {
    const params = new URLSearchParams({
      limit: String(limit),
      countrySlug: request.countrySlug,
      countryName: request.countryName,
      citySlug: request.citySlug,
      cityName: request.cityName,
    });

    if (trimmed) {
      params.set("q", trimmed);
    }

    if (featured) {
      params.set("featured", "1");
    }

    if (request.region) {
      params.set("region", request.region);
    }

    const response = await fetch(`/api/places/search?${params.toString()}`);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        results: [] as PlaceSearchHit[],
        error: payload?.error ?? "Place search is unavailable.",
      };
    }

    const payload = (await response.json()) as { results?: PlaceSearchHit[] };

    return {
      results: payload.results ?? [],
      error: null as string | null,
    };
  } catch {
    return {
      results: [] as PlaceSearchHit[],
      error: "Place search is unavailable.",
    };
  }
}

export async function loadFeaturedPlacesForChat(
  request: Omit<CityRoomPlaceSearchRequest, "query" | "featured">
) {
  return searchPlacesForChat({
    ...request,
    featured: true,
    limit: request.limit ?? 10,
  });
}

export async function loadPlacesToVisitForChat(
  request: Omit<CityRoomPlaceSearchRequest, "query" | "featured" | "limit"> & { limit?: number }
) {
  const limit = request.limit ?? 24;

  try {
    const params = new URLSearchParams({
      limit: String(limit),
      browse: "1",
      countrySlug: request.countrySlug,
      countryName: request.countryName,
      citySlug: request.citySlug,
      cityName: request.cityName,
    });

    if (request.region) {
      params.set("region", request.region);
    }

    const response = await fetch(`/api/places/search?${params.toString()}`);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        results: [] as PlaceSearchHit[],
        error: payload?.error ?? "Places to visit are unavailable.",
        usingFallback: false,
      };
    }

    const payload = (await response.json()) as {
      results?: PlaceSearchHit[];
      usingFallback?: boolean;
    };

    return {
      results: payload.results ?? [],
      error: null as string | null,
      usingFallback: payload.usingFallback ?? false,
    };
  } catch {
    return {
      results: [] as PlaceSearchHit[],
      error: "Places to visit are unavailable.",
      usingFallback: false,
    };
  }
}
