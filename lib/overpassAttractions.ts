import type { PlaceSearchHit } from "@/lib/placeSearchApi";
import {
  dedupePlaceSearchHits,
  isWithinCityRoomScope,
  normalizePlaceSearchText,
  type CityRoomPlaceSearchScope,
} from "@/lib/touristPlaceSearch";
import { wikimediaCommonsImageUrl } from "@/lib/placeImages";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const EXCLUDED_OVERPASS_AMENITIES = new Set([
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "food_court",
  "hotel",
  "motel",
  "guest_house",
  "hostel",
  "pharmacy",
  "fuel",
  "bank",
  "atm",
  "marketplace",
  "supermarket",
  "shop",
  "store",
]);

function elementCoordinates(element: OverpassElement) {
  if (element.lat != null && element.lon != null) {
    return { latitude: element.lat, longitude: element.lon };
  }

  if (element.center) {
    return { latitude: element.center.lat, longitude: element.center.lon };
  }

  return null;
}

function isExcludedOverpassElement(element: OverpassElement) {
  const tags = element.tags ?? {};

  if (tags.shop || (tags.amenity && EXCLUDED_OVERPASS_AMENITIES.has(tags.amenity))) {
    return true;
  }

  const name = tags.name?.toLowerCase() ?? "";

  return ["restaurant", "hotel", "cafe", "hostel", "shop", "store", "bar "].some((hint) => name.includes(hint));
}

function descriptionFromOverpassTags(tags: Record<string, string>) {
  return (
    tags.description?.trim() ||
    tags["description:en"]?.trim() ||
    tags.tourism?.replace(/_/g, " ") ||
    tags.historic?.replace(/_/g, " ") ||
    tags.natural?.replace(/_/g, " ") ||
    null
  );
}

function buildAddressFromTags(tags: Record<string, string>, scope: CityRoomPlaceSearchScope) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ").trim();
  const city = tags["addr:city"] ?? tags["addr:town"] ?? scope.cityName;
  const country = tags["addr:country"] ?? scope.countryName;
  const parts = [street, city, country].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return `${tags.name ?? "Place"}, ${scope.cityName}, ${scope.countryName}`;
}

function matchesPlaceQuery(name: string, query: string) {
  const normalizedName = normalizePlaceSearchText(name);
  const tokens = normalizePlaceSearchText(query).split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => normalizedName.includes(token));
}

function overpassQueryForScope(scope: CityRoomPlaceSearchScope, resultLimit: number) {
  const radiusMeters = Math.round(scope.searchRadiusKm * 1000);
  const { latitude, longitude } = scope;

  return `
    [out:json][timeout:25];
    (
      node["tourism"~"attraction|museum|viewpoint|artwork|theme_park|gallery|zoo|aquarium|information"]["name"](around:${radiusMeters},${latitude},${longitude});
      way["tourism"~"attraction|museum|viewpoint|artwork|theme_park|gallery|zoo|aquarium"]["name"](around:${radiusMeters},${latitude},${longitude});
      node["historic"]["name"](around:${radiusMeters},${latitude},${longitude});
      way["historic"]["name"](around:${radiusMeters},${latitude},${longitude});
      node["natural"~"peak|lake|water|river|bay|beach|cave_entrance"]["name"](around:${radiusMeters},${latitude},${longitude});
      way["natural"~"peak|lake|water|river|bay|beach"]["name"](around:${radiusMeters},${latitude},${longitude});
      node["leisure"~"park|garden|nature_reserve"]["name"](around:${radiusMeters},${latitude},${longitude});
      way["leisure"~"park|garden|nature_reserve"]["name"](around:${radiusMeters},${latitude},${longitude});
      node["man_made"~"tower|bridge|obelisk|monument"]["name"](around:${radiusMeters},${latitude},${longitude});
      way["man_made"~"tower|bridge|obelisk"]["name"](around:${radiusMeters},${latitude},${longitude});
      node["place"~"square"]["name"](around:${radiusMeters},${latitude},${longitude});
      way["place"~"square"]["name"](around:${radiusMeters},${latitude},${longitude});
      relation["tourism"]["name"](around:${radiusMeters},${latitude},${longitude});
      relation["historic"]["name"](around:${radiusMeters},${latitude},${longitude});
    );
    out center ${Math.min(resultLimit * 4, 40)};
  `;
}

function overpassElementToHit(element: OverpassElement, scope: CityRoomPlaceSearchScope): PlaceSearchHit | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();

  if (!name || isExcludedOverpassElement(element)) {
    return null;
  }

  const coordinates = elementCoordinates(element);

  if (!coordinates || !isWithinCityRoomScope(coordinates.latitude, coordinates.longitude, scope)) {
    return null;
  }

  const wikimediaCommons = tags.wikimedia_commons ?? null;
  const imageUrl = wikimediaCommons ? wikimediaCommonsImageUrl(wikimediaCommons) : null;

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    address: buildAddressFromTags(tags, scope),
    description: descriptionFromOverpassTags(tags),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    city: tags["addr:city"] ?? tags["addr:town"] ?? scope.cityName,
    region: tags["addr:state"] ?? scope.region ?? null,
    country: tags["addr:country"] ?? scope.countryName,
    imageUrl,
    wikipediaTag: tags.wikipedia ?? tags["wikipedia:en"] ?? null,
    wikimediaCommons,
  };
}

export async function searchOverpassAttractions(
  query: string,
  limit: number,
  scope: CityRoomPlaceSearchScope
): Promise<PlaceSearchHit[]> {
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams({ data: overpassQueryForScope(scope, limit) }).toString(),
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error("Overpass place search failed.");
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const results: PlaceSearchHit[] = [];

  for (const element of payload.elements ?? []) {
    const hit = overpassElementToHit(element, scope);

    if (!hit) {
      continue;
    }

    if (!matchesPlaceQuery(hit.name, query)) {
      continue;
    }

    results.push(hit);
  }

  results.sort((left, right) => left.name.localeCompare(right.name));

  return dedupePlaceSearchHits(results, limit);
}

export async function listFeaturedOverpassAttractions(
  limit: number,
  scope: CityRoomPlaceSearchScope
): Promise<PlaceSearchHit[]> {
  return searchOverpassAttractions("", limit, scope);
}
