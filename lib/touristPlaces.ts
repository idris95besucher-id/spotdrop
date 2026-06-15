import type { PlaceSearchHit } from "@/lib/placeSearchApi";
import {
  getCatalogScopeSeed,
  getCountryFallbackPlacesFromCatalog,
  getCuratedPlacesFromCatalog,
  hasCatalogPlacesForCity,
  normalizeCitySlug,
  normalizeCountrySlug,
} from "@/lib/cityAttractionsCatalog";
import {
  type CityRoomPlaceSearchScope,
  normalizePlaceSearchText,
} from "@/lib/touristPlaceSearch";
import type { CuratedTouristPlace } from "@/lib/touristPlaceTypes";

export type { CuratedTouristPlace, TouristPlaceCategory } from "@/lib/touristPlaceTypes";

export function resolveCityRoomPlaceSearchScope(input: {
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
}): CityRoomPlaceSearchScope | null {
  const seed = getCatalogScopeSeed(input);

  if (!seed) {
    return null;
  }

  return {
    ...seed,
    countryName: input.countryName,
    cityName: input.cityName,
    region: input.region ?? seed.region ?? null,
  };
}

export function getCuratedTouristPlacesForRoom(
  countrySlug: string,
  citySlug: string,
  cityName?: string | null,
  countryName?: string | null
) {
  return getCuratedPlacesFromCatalog({
    countrySlug,
    countryName: countryName ?? countrySlug,
    citySlug,
    cityName: cityName ?? citySlug,
  });
}

function scoreCuratedPlace(place: CuratedTouristPlace, query: string) {
  const normalizedQuery = normalizePlaceSearchText(query);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return 0;
  }

  const haystack = normalizePlaceSearchText(
    [place.name, place.address, place.description ?? "", place.city, place.region ?? "", ...place.keywords].join(" ")
  );

  let score = 0;

  for (const token of tokens) {
    if (normalizePlaceSearchText(place.name).includes(token)) {
      score += 12;
    }

    if (place.keywords.some((keyword) => normalizePlaceSearchText(keyword).includes(token))) {
      score += 8;
    }

    if (haystack.includes(token)) {
      score += 4;
    }
  }

  if (normalizePlaceSearchText(place.name).startsWith(normalizedQuery)) {
    score += 10;
  }

  return score;
}

export function curatedPlaceToSearchHit(place: CuratedTouristPlace): PlaceSearchHit {
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    description: place.description,
    latitude: place.latitude,
    longitude: place.longitude,
    city: place.city,
    region: place.region,
    country: place.country,
    imageUrl: place.imageUrl ?? null,
    wikipediaTag: null,
    wikimediaCommons: null,
  };
}

function sortCuratedByRank(places: CuratedTouristPlace[]) {
  return places.slice().sort((left, right) => (left.rank ?? 99) - (right.rank ?? 99));
}

export function listFeaturedCuratedPlaces(scope: CityRoomPlaceSearchScope, limit: number): PlaceSearchHit[] {
  const local = sortCuratedByRank(
    getCuratedPlacesFromCatalog({
      countrySlug: scope.countrySlug,
      countryName: scope.countryName,
      citySlug: scope.citySlug,
      cityName: scope.cityName,
      region: scope.region,
    })
  ).slice(0, limit);

  if (local.length >= limit) {
    return local.map(curatedPlaceToSearchHit);
  }

  const fallback = sortCuratedByRank(
    getCountryFallbackPlacesFromCatalog({
      countrySlug: scope.countrySlug,
      countryName: scope.countryName,
      limit: limit - local.length,
    })
  ).slice(0, limit - local.length);

  return [...local, ...fallback].map(curatedPlaceToSearchHit);
}

export function listBrowseCuratedPlaces(
  scope: CityRoomPlaceSearchScope,
  limit: number
): { places: PlaceSearchHit[]; usingFallback: boolean } {
  const local = sortCuratedByRank(
    getCuratedPlacesFromCatalog({
      countrySlug: scope.countrySlug,
      countryName: scope.countryName,
      citySlug: scope.citySlug,
      cityName: scope.cityName,
      region: scope.region,
    })
  );

  if (local.length > 0) {
    return {
      places: local.slice(0, limit).map(curatedPlaceToSearchHit),
      usingFallback: false,
    };
  }

  const fallback = sortCuratedByRank(
    getCountryFallbackPlacesFromCatalog({
      countrySlug: scope.countrySlug,
      countryName: scope.countryName,
      limit,
    })
  );

  return {
    places: fallback.slice(0, limit).map(curatedPlaceToSearchHit),
    usingFallback: fallback.length > 0,
  };
}

export function searchCuratedTouristPlaces(
  query: string,
  scope: CityRoomPlaceSearchScope,
  limit: number
): PlaceSearchHit[] {
  const places = getCuratedPlacesFromCatalog({
    countrySlug: scope.countrySlug,
    countryName: scope.countryName,
    citySlug: scope.citySlug,
    cityName: scope.cityName,
    region: scope.region,
  });
  const normalizedQuery = normalizePlaceSearchText(query);

  const scored = places
    .map((place) => ({ place, score: scoreCuratedPlace(place, query) }))
    .filter(({ score, place }) => {
      if (score > 0) {
        return true;
      }

      if (!normalizedQuery) {
        return false;
      }

      return normalizePlaceSearchText(place.name).includes(normalizedQuery);
    })
    .sort((left, right) => right.score - left.score || (left.place.rank ?? 99) - (right.place.rank ?? 99))
    .slice(0, limit)
    .map(({ place }) => curatedPlaceToSearchHit(place));

  return scored;
}

export function hasCuratedTouristPlacesForRoom(countrySlug: string, citySlug: string, cityName?: string | null) {
  return hasCatalogPlacesForCity(countrySlug, citySlug, cityName);
}

export { normalizeCitySlug, normalizeCountrySlug };
