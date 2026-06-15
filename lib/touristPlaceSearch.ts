import type { PlaceSearchHit } from "@/lib/placeSearchApi";

export type CityRoomPlaceSearchScope = {
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
  latitude: number;
  longitude: number;
  searchRadiusKm: number;
};

export const EXCLUDED_GOOGLE_PLACE_TYPES = new Set([
  "restaurant",
  "cafe",
  "coffee_shop",
  "bar",
  "night_club",
  "hotel",
  "lodging",
  "motel",
  "guest_house",
  "bed_and_breakfast",
  "store",
  "shopping_mall",
  "supermarket",
  "grocery_store",
  "convenience_store",
  "pharmacy",
  "drugstore",
  "gas_station",
  "car_repair",
  "car_dealer",
  "bank",
  "atm",
  "beauty_salon",
  "hair_care",
  "spa",
  "gym",
  "real_estate_agency",
  "lawyer",
  "accounting",
  "insurance_agency",
  "corporate_office",
  "finance",
  "food",
  "meal_delivery",
  "meal_takeaway",
  "bakery",
  "meal_takeaway",
]);

export const INCLUDED_GOOGLE_PLACE_TYPES = new Set([
  "tourist_attraction",
  "landmark",
  "museum",
  "park",
  "national_park",
  "state_park",
  "viewpoint",
  "historical_landmark",
  "monument",
  "castle",
  "church",
  "place_of_worship",
  "hindu_temple",
  "mosque",
  "synagogue",
  "city_hall",
  "cultural_landmark",
  "performing_arts_theater",
  "art_gallery",
  "zoo",
  "aquarium",
  "amusement_park",
  "campground",
  "marina",
  "beach",
  "natural_feature",
  "point_of_interest",
  "plaza",
  "stadium",
  "arena",
  "observation_deck",
  "botanical_garden",
  "garden",
  "bridge",
  "ferry_terminal",
  "transit_station",
  "train_station",
  "light_rail_station",
  "hiking_area",
  "wildlife_park",
  "wildlife_refuge",
  "historical_place",
  "sculpture",
]);

const NOMINATIM_EXCLUDED_AMENITIES = new Set([
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "biergarten",
  "fast_food",
  "food_court",
  "hotel",
  "motel",
  "guest_house",
  "hostel",
  "pharmacy",
  "fuel",
  "nightclub",
  "bank",
  "atm",
  "marketplace",
  "supermarket",
  "clinic",
  "doctors",
  "dentist",
  "car_rental",
  "car_wash",
  "parking",
]);

const NOMINATIM_INCLUDED_CLASSES = new Set(["tourism", "historic", "natural", "leisure", "boundary", "man_made"]);

const NOMINATIM_INCLUDED_LEISURE = new Set(["park", "garden", "nature_reserve", "track", "pitch"]);

const COMMERCIAL_NAME_HINTS = [
  "restaurant",
  "café",
  "cafe",
  "hotel",
  "hostel",
  "bar ",
  " bistro",
  "pizzeria",
  "grill",
  "shop",
  "store",
  "market",
  "pharmacy",
  "apotheke",
  "drogerie",
  "migros",
  "coop",
  "denner",
  "lidl",
  "aldi",
];

export function normalizePlaceSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinCityRoomScope(
  latitude: number,
  longitude: number,
  scope: CityRoomPlaceSearchScope
) {
  return haversineDistanceKm(scope.latitude, scope.longitude, latitude, longitude) <= scope.searchRadiusKm;
}

function hasCommercialNameHint(name: string) {
  const normalized = normalizePlaceSearchText(name);
  return COMMERCIAL_NAME_HINTS.some((hint) => normalized.includes(hint));
}

export function isExcludedGooglePlaceType(primaryType: string | null | undefined, types: string[] = []) {
  const allTypes = [primaryType, ...types].filter(Boolean) as string[];

  if (allTypes.some((type) => EXCLUDED_GOOGLE_PLACE_TYPES.has(type))) {
    return true;
  }

  if (allTypes.some((type) => INCLUDED_GOOGLE_PLACE_TYPES.has(type))) {
    return false;
  }

  return allTypes.some((type) => type.includes("restaurant") || type.includes("hotel") || type.includes("store"));
}

export function isIncludedGooglePlaceType(primaryType: string | null | undefined, types: string[] = []) {
  const allTypes = [primaryType, ...types].filter(Boolean) as string[];

  if (allTypes.length === 0) {
    return false;
  }

  if (isExcludedGooglePlaceType(primaryType, types)) {
    return false;
  }

  return allTypes.some((type) => INCLUDED_GOOGLE_PLACE_TYPES.has(type));
}

export function isIncludedNominatimPlace(item: {
  class?: string;
  type?: string;
  name?: string;
  display_name?: string;
}) {
  const placeClass = item.class ?? "";
  const placeType = item.type ?? "";
  const label = item.name ?? item.display_name ?? "";

  if (placeClass === "amenity" && NOMINATIM_EXCLUDED_AMENITIES.has(placeType)) {
    return false;
  }

  if (placeClass === "shop") {
    return false;
  }

  if (placeClass === "leisure") {
    return NOMINATIM_INCLUDED_LEISURE.has(placeType);
  }

  if (NOMINATIM_INCLUDED_CLASSES.has(placeClass)) {
    return !hasCommercialNameHint(label);
  }

  if (placeClass === "place" && ["city", "town", "village", "hamlet", "suburb", "quarter"].includes(placeType)) {
    return false;
  }

  if (placeClass === "highway" || placeClass === "building" && placeType !== "yes") {
    return false;
  }

  return false;
}

export function dedupePlaceSearchHits(results: PlaceSearchHit[], limit: number) {
  const seen = new Set<string>();
  const deduped: PlaceSearchHit[] = [];

  for (const hit of results) {
    const key = `${normalizePlaceSearchText(hit.name)}|${hit.latitude.toFixed(3)}|${hit.longitude.toFixed(3)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(hit);

    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

export function filterPlaceSearchHitsForCityRoom(
  results: PlaceSearchHit[],
  scope: CityRoomPlaceSearchScope,
  limit: number
) {
  const filtered = results.filter((hit) => {
    if (hasCommercialNameHint(hit.name)) {
      return false;
    }

    return isWithinCityRoomScope(hit.latitude, hit.longitude, scope);
  });

  return dedupePlaceSearchHits(filtered, limit);
}

export function formatCityRegionLabel(city: string | null, region: string | null) {
  const parts = [city, region].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatPlaceLocationLabel(
  city: string | null,
  region: string | null,
  country: string | null
) {
  const parts: string[] = [];

  if (city?.trim()) {
    parts.push(city.trim());
  }

  if (region?.trim() && region.trim() !== city?.trim()) {
    parts.push(region.trim());
  }

  if (country?.trim() && country.trim() !== city?.trim()) {
    parts.push(country.trim());
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function isGeneralNominatimPlace(item: {
  class?: string;
  name?: string;
  display_name?: string;
}) {
  const placeClass = item.class ?? "";

  if (placeClass === "highway") {
    return false;
  }

  return Boolean(item.name?.trim() || item.display_name?.trim());
}

export function filterGeneralPlaceSearchHits(
  results: PlaceSearchHit[],
  scope: CityRoomPlaceSearchScope,
  limit: number
) {
  const filtered = results.filter((hit) => isWithinCityRoomScope(hit.latitude, hit.longitude, scope));

  return dedupePlaceSearchHits(filtered, limit);
}
