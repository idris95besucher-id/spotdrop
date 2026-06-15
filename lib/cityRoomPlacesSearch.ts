import type { PlaceSearchHit } from "@/lib/placeSearchApi";
import { resolveCityRoomScope, resolveCountryFallbackScope } from "@/lib/cityRoomPlaceScope";
import { listFeaturedOverpassAttractions, searchOverpassAttractions } from "@/lib/overpassAttractions";
import { googlePlacePhotoUrl, resolvePlaceImageUrl } from "@/lib/placeImages";
import {
  dedupePlaceSearchHits,
  filterGeneralPlaceSearchHits,
  filterPlaceSearchHitsForCityRoom,
  isGeneralNominatimPlace,
  isExcludedGooglePlaceType,
  isIncludedGooglePlaceType,
  isIncludedNominatimPlace,
  isWithinCityRoomScope,
  normalizePlaceSearchText,
  type CityRoomPlaceSearchScope,
} from "@/lib/touristPlaceSearch";
import {
  listBrowseCuratedPlaces,
  listFeaturedCuratedPlaces,
  searchCuratedTouristPlaces,
} from "@/lib/touristPlaces";

function cityFromAddress(address: Record<string, string | undefined> | undefined) {
  if (!address) {
    return null;
  }

  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    null
  );
}

function regionFromAddress(address: Record<string, string | undefined> | undefined) {
  if (!address) {
    return null;
  }

  return address.state ?? address.region ?? address.county ?? null;
}

function descriptionFromNominatim(item: { type?: string; class?: string; extratags?: Record<string, string> }) {
  const wiki = item.extratags?.wikipedia ?? item.extratags?.wikidata;

  if (wiki) {
    return `Listed on ${wiki.startsWith("http") ? "Wikipedia" : wiki}`;
  }

  const parts = [item.class, item.type].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return parts
    .map((part) => part!.replace(/_/g, " "))
    .join(" · ");
}

async function searchWithNominatim(
  query: string,
  limit: number,
  scope: CityRoomPlaceSearchScope
): Promise<PlaceSearchHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", `${query}, ${scope.cityName}, ${scope.countryName}`);
  url.searchParams.set("limit", String(Math.min(limit * 4, 20)));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");

  const latDelta = scope.searchRadiusKm / 111;
  const lngDelta = scope.searchRadiusKm / (111 * Math.cos((scope.latitude * Math.PI) / 180));
  const west = scope.longitude - lngDelta;
  const east = scope.longitude + lngDelta;
  const south = scope.latitude - latDelta;
  const north = scope.latitude + latDelta;

  url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
  url.searchParams.set("bounded", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "SpotDrop/1.0 (city-room-place-search)",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error("Place search failed.");
  }

  const data = (await response.json()) as Array<{
    place_id?: number;
    display_name?: string;
    lat?: string;
    lon?: string;
    type?: string;
    class?: string;
    name?: string;
    extratags?: Record<string, string>;
    address?: Record<string, string | undefined>;
  }>;

  const results: PlaceSearchHit[] = [];

  for (const item of data) {
    if (!isIncludedNominatimPlace(item)) {
      continue;
    }

    const latitude = Number.parseFloat(item.lat ?? "");
    const longitude = Number.parseFloat(item.lon ?? "");
    const address = item.display_name?.trim();

    if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    if (!isWithinCityRoomScope(latitude, longitude, scope)) {
      continue;
    }

    const name = item.name?.trim() || address.split(",")[0]?.trim() || address;

    results.push({
      id: String(item.place_id ?? `${latitude}-${longitude}-${results.length}`),
      name,
      address,
      description: descriptionFromNominatim(item),
      latitude,
      longitude,
      city: cityFromAddress(item.address) ?? scope.cityName,
      region: regionFromAddress(item.address) ?? scope.region ?? null,
      country: item.address?.country ?? scope.countryName,
      imageUrl: null,
      wikipediaTag: item.extratags?.wikipedia ?? null,
      wikimediaCommons: item.extratags?.wikimedia_commons ?? null,
    });
  }

  return dedupePlaceSearchHits(results, limit);
}

async function searchWithNominatimGeneral(
  query: string,
  limit: number,
  scope: CityRoomPlaceSearchScope
): Promise<PlaceSearchHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", `${query}, ${scope.cityName}, ${scope.countryName}`);
  url.searchParams.set("limit", String(Math.min(limit * 4, 20)));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");

  const latDelta = (scope.searchRadiusKm * 1.5) / 111;
  const lngDelta = (scope.searchRadiusKm * 1.5) / (111 * Math.cos((scope.latitude * Math.PI) / 180));
  const west = scope.longitude - lngDelta;
  const east = scope.longitude + lngDelta;
  const south = scope.latitude - latDelta;
  const north = scope.latitude + latDelta;

  url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
  url.searchParams.set("bounded", "0");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "SpotDrop/1.0 (city-room-general-place-search)",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error("Place search failed.");
  }

  const data = (await response.json()) as Array<{
    place_id?: number;
    display_name?: string;
    lat?: string;
    lon?: string;
    type?: string;
    class?: string;
    name?: string;
    extratags?: Record<string, string>;
    address?: Record<string, string | undefined>;
  }>;

  const results: PlaceSearchHit[] = [];

  for (const item of data) {
    if (!isGeneralNominatimPlace(item)) {
      continue;
    }

    const latitude = Number.parseFloat(item.lat ?? "");
    const longitude = Number.parseFloat(item.lon ?? "");
    const address = item.display_name?.trim();

    if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    if (!isWithinCityRoomScope(latitude, longitude, scope)) {
      continue;
    }

    const name = item.name?.trim() || address.split(",")[0]?.trim() || address;
    const placeType = [item.class, item.type].filter(Boolean).join(" · ");

    results.push({
      id: String(item.place_id ?? `${latitude}-${longitude}-${results.length}`),
      name,
      address,
      description: placeType ? placeType.replace(/_/g, " ") : null,
      latitude,
      longitude,
      city: cityFromAddress(item.address) ?? scope.cityName,
      region: regionFromAddress(item.address) ?? scope.region ?? null,
      country: item.address?.country ?? scope.countryName,
      imageUrl: null,
      wikipediaTag: item.extratags?.wikipedia ?? null,
      wikimediaCommons: item.extratags?.wikimedia_commons ?? null,
    });
  }

  return dedupePlaceSearchHits(results, limit);
}

async function searchWithGooglePlacesGeneral(
  query: string,
  limit: number,
  apiKey: string,
  scope: CityRoomPlaceSearchScope
) {
  const textQuery = `${query} ${scope.cityName} ${scope.countryName}`.trim();

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.editorialSummary,places.shortFormattedAddress,places.primaryType,places.types,places.photos",
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: Math.min(limit * 3, 20),
      locationBias: {
        circle: {
          center: {
            latitude: scope.latitude,
            longitude: scope.longitude,
          },
          radius: scope.searchRadiusKm * 1500,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Google Places search failed.");
  }

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      shortFormattedAddress?: string;
      primaryType?: string;
      types?: string[];
      editorialSummary?: { text?: string };
      location?: { latitude?: number; longitude?: number };
      photos?: Array<{ name?: string }>;
    }>;
  };

  const results: PlaceSearchHit[] = [];

  for (const place of data.places ?? []) {
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    const name = place.displayName?.text?.trim();
    const address = place.formattedAddress?.trim() || place.shortFormattedAddress?.trim();

    if (!name || !address || latitude == null || longitude == null) {
      continue;
    }

    if (!isWithinCityRoomScope(latitude, longitude, scope)) {
      continue;
    }

    const photoName = place.photos?.[0]?.name;
    const typeLabel = place.primaryType ?? place.types?.[0] ?? null;

    results.push({
      id: place.id ?? `${latitude}-${longitude}-${results.length}`,
      name,
      address,
      description:
        place.editorialSummary?.text?.trim() ||
        (typeLabel ? typeLabel.replace(/_/g, " ") : null),
      latitude,
      longitude,
      city: scope.cityName,
      region: scope.region ?? null,
      country: scope.countryName,
      imageUrl: photoName ? googlePlacePhotoUrl(photoName, apiKey) : null,
      wikipediaTag: null,
      wikimediaCommons: null,
    });
  }

  return dedupePlaceSearchHits(results, limit);
}

async function searchWithGooglePlaces(
  query: string,
  limit: number,
  apiKey: string,
  scope: CityRoomPlaceSearchScope
) {
  const textQuery = query.trim()
    ? `${query} tourist attraction ${scope.cityName}`
    : `top tourist attractions in ${scope.cityName}`;

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.editorialSummary,places.shortFormattedAddress,places.primaryType,places.types,places.photos",
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: Math.min(limit * 3, 20),
      locationBias: {
        circle: {
          center: {
            latitude: scope.latitude,
            longitude: scope.longitude,
          },
          radius: scope.searchRadiusKm * 1000,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Google Places search failed.");
  }

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      shortFormattedAddress?: string;
      primaryType?: string;
      types?: string[];
      editorialSummary?: { text?: string };
      location?: { latitude?: number; longitude?: number };
      photos?: Array<{ name?: string }>;
    }>;
  };

  const results: PlaceSearchHit[] = [];

  for (const place of data.places ?? []) {
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    const name = place.displayName?.text?.trim();
    const address = place.formattedAddress?.trim() || place.shortFormattedAddress?.trim();
    const types = place.types ?? [];

    if (!name || !address || latitude == null || longitude == null) {
      continue;
    }

    if (isExcludedGooglePlaceType(place.primaryType, types)) {
      continue;
    }

    if (!isIncludedGooglePlaceType(place.primaryType, types)) {
      continue;
    }

    if (!isWithinCityRoomScope(latitude, longitude, scope)) {
      continue;
    }

    const photoName = place.photos?.[0]?.name;

    results.push({
      id: place.id ?? `${latitude}-${longitude}-${results.length}`,
      name,
      address,
      description:
        place.editorialSummary?.text?.trim() ||
        (place.primaryType ? place.primaryType.replace(/_/g, " ") : null),
      latitude,
      longitude,
      city: scope.cityName,
      region: scope.region ?? null,
      country: scope.countryName,
      imageUrl: photoName ? googlePlacePhotoUrl(photoName, apiKey) : null,
      wikipediaTag: null,
      wikimediaCommons: null,
    });
  }

  return dedupePlaceSearchHits(results, limit);
}

async function enrichPlaceImages(hits: PlaceSearchHit[]) {
  return Promise.all(
    hits.map(async (hit) => {
      if (hit.imageUrl) {
        return hit;
      }

      const imageUrl = await resolvePlaceImageUrl({
        name: hit.name,
        city: hit.city,
        imageUrl: hit.imageUrl,
        wikipediaTag: hit.wikipediaTag,
        wikimediaCommons: hit.wikimediaCommons,
        latitude: hit.latitude,
        longitude: hit.longitude,
      });

      return {
        ...hit,
        imageUrl,
      };
    })
  );
}

function stripInternalFields(hits: PlaceSearchHit[]): PlaceSearchHit[] {
  return hits.map(({ wikipediaTag: _w, wikimediaCommons: _m, ...hit }) => hit);
}

async function collectPlaceHits(
  query: string,
  limit: number,
  scope: CityRoomPlaceSearchScope,
  googleKey: string | null,
  includeCurated: boolean
) {
  const merged: PlaceSearchHit[] = [];

  if (includeCurated) {
    const curated = query.trim()
      ? searchCuratedTouristPlaces(query, scope, limit)
      : listFeaturedCuratedPlaces(scope, limit);

    merged.push(...curated);
  }

  if (googleKey) {
    try {
      merged.push(...(await searchWithGooglePlaces(query, limit, googleKey, scope)));
    } catch (error) {
      console.error("Google Places search failed:", error);
    }
  }

  if (merged.length < limit) {
    try {
      merged.push(...(await searchOverpassAttractions(query, limit - merged.length, scope)));
    } catch (error) {
      console.error("Overpass place search failed:", error);
    }
  }

  if (merged.length < limit) {
    try {
      merged.push(...(await searchWithNominatim(query, limit - merged.length, scope)));
    } catch (error) {
      console.error("Nominatim place search failed:", error);
    }
  }

  return merged;
}

async function collectFeaturedPlaceHits(limit: number, scope: CityRoomPlaceSearchScope, googleKey: string | null) {
  const merged: PlaceSearchHit[] = [...listFeaturedCuratedPlaces(scope, limit)];

  if (googleKey) {
    try {
      merged.push(...(await searchWithGooglePlaces("", limit, googleKey, scope)));
    } catch (error) {
      console.error("Google featured place search failed:", error);
    }
  }

  if (merged.length < limit) {
    try {
      merged.push(...(await listFeaturedOverpassAttractions(limit - merged.length, scope)));
    } catch (error) {
      console.error("Overpass featured place search failed:", error);
    }
  }

  return merged;
}

export async function searchGeneralCityRoomPlaces(input: {
  query: string;
  limit: number;
  scope: CityRoomPlaceSearchScope;
  googleKey?: string | null;
}) {
  const googleKey = input.googleKey?.trim() || null;
  const query = input.query.trim();
  const merged: PlaceSearchHit[] = [];

  if (googleKey) {
    try {
      merged.push(...(await searchWithGooglePlacesGeneral(query, input.limit, googleKey, input.scope)));
    } catch (error) {
      console.error("Google general place search failed:", error);
    }
  }

  if (merged.length < input.limit) {
    try {
      merged.push(
        ...(await searchWithNominatimGeneral(query, input.limit - merged.length, input.scope))
      );
    } catch (error) {
      console.error("Nominatim general place search failed:", error);
    }
  }

  let results = filterGeneralPlaceSearchHits(merged, input.scope, input.limit);

  if (results.length < input.limit) {
    const countryScope = await resolveCountryFallbackScope(input.scope);
    const countryMerged: PlaceSearchHit[] = [];

    if (googleKey) {
      try {
        countryMerged.push(
          ...(await searchWithGooglePlacesGeneral(query, input.limit, googleKey, countryScope))
        );
      } catch (error) {
        console.error("Google general country place search failed:", error);
      }
    }

    if (countryMerged.length < input.limit) {
      try {
        countryMerged.push(
          ...(await searchWithNominatimGeneral(
            query,
            input.limit - countryMerged.length,
            countryScope
          ))
        );
      } catch (error) {
        console.error("Nominatim general country place search failed:", error);
      }
    }

    const countryResults = filterGeneralPlaceSearchHits(
      countryMerged,
      countryScope,
      input.limit - results.length
    );
    results = dedupePlaceSearchHits([...results, ...countryResults], input.limit);
  }

  const enriched = await enrichPlaceImages(results);

  return stripInternalFields(enriched);
}

export async function searchCityRoomPlaces(input: {
  query: string;
  limit: number;
  scope: CityRoomPlaceSearchScope;
  googleKey?: string | null;
}) {
  const googleKey = input.googleKey?.trim() || null;
  const query = input.query.trim();
  let merged = await collectPlaceHits(query, input.limit, input.scope, googleKey, true);
  let results = filterPlaceSearchHitsForCityRoom(merged, input.scope, input.limit);

  if (results.length < input.limit) {
    const countryScope = await resolveCountryFallbackScope(input.scope);
    const countryMerged = await collectPlaceHits(query, input.limit, countryScope, googleKey, false);
    const countryResults = filterPlaceSearchHitsForCityRoom(
      countryMerged,
      countryScope,
      input.limit - results.length
    );
    results = dedupePlaceSearchHits([...results, ...countryResults], input.limit);
  }

  const enriched = await enrichPlaceImages(results);

  return stripInternalFields(enriched);
}

export async function listBrowseCityRoomPlaces(input: {
  limit: number;
  scope: CityRoomPlaceSearchScope;
  googleKey?: string | null;
}) {
  const { places, usingFallback } = listBrowseCuratedPlaces(input.scope, input.limit);
  const enriched = await enrichPlaceImages(places);

  return {
    results: stripInternalFields(enriched),
    usingFallback,
  };
}

export async function listFeaturedCityRoomPlaces(input: {
  limit: number;
  scope: CityRoomPlaceSearchScope;
  googleKey?: string | null;
}) {
  const googleKey = input.googleKey?.trim() || null;
  let merged = await collectFeaturedPlaceHits(input.limit, input.scope, googleKey);
  let results = filterPlaceSearchHitsForCityRoom(merged, input.scope, input.limit);

  if (results.length < input.limit) {
    const countryScope = await resolveCountryFallbackScope(input.scope);
    const countryMerged = await collectFeaturedPlaceHits(input.limit, countryScope, googleKey);
    const countryResults = filterPlaceSearchHitsForCityRoom(
      countryMerged,
      countryScope,
      input.limit - results.length
    );
    results = dedupePlaceSearchHits([...results, ...countryResults], input.limit);
  }

  const enriched = await enrichPlaceImages(results);

  return stripInternalFields(enriched);
}

export async function resolveScopeFromRequest(input: {
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
}) {
  return resolveCityRoomScope(input);
}

export function placeMatchesQuery(hit: PlaceSearchHit, query: string) {
  const normalizedQuery = normalizePlaceSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizePlaceSearchText(
    [hit.name, hit.address, hit.description ?? "", hit.city ?? "", hit.region ?? ""].join(" ")
  );

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}
