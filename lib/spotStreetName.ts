/**
 * Confident street extraction from Nominatim reverse-geocode results.
 *
 * SpotDrop never invents a street from coarse neighbourhood/admin results or from
 * full `display_name` strings — those often lead with a nearby major road
 * (e.g. "Bernstrasse") while the pin is on a minor path.
 */

/** Nominatim zoom that includes buildings, streets, and minor paths. */
export const NOMINATIM_STREET_ZOOM = 18;

const STREET_ADDRESS_TYPES = new Set([
  "road",
  "pedestrian",
  "path",
  "footway",
  "cycleway",
  "living_street",
  "residential",
  "service",
  "track",
  "street",
  "highway",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
]);

/** Admin / settlement ranks — hierarchical `address.road` here is often a nearby major road. */
const COARSE_ADDRESS_TYPES = new Set([
  "suburb",
  "neighbourhood",
  "quarter",
  "city",
  "town",
  "village",
  "municipality",
  "county",
  "state",
  "country",
  "region",
  "district",
  "city_district",
  "borough",
  "administrative",
]);

const STREET_NAME_FIELDS = [
  "road",
  "pedestrian",
  "path",
  "footway",
  "cycleway",
  "street",
] as const;

export type NominatimReversePayload = {
  name?: string;
  display_name?: string;
  addresstype?: string;
  category?: string;
  type?: string;
  address?: Record<string, string | undefined>;
};

function normalizePart(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function streetCandidateFromAddress(address: Record<string, string | undefined> | undefined) {
  if (!address) {
    return null;
  }

  for (const field of STREET_NAME_FIELDS) {
    const value = normalizePart(address[field]);

    if (value) {
      return value;
    }
  }

  return null;
}

function isCoarseAdminResult(data: NominatimReversePayload) {
  const addresstype = (data.addresstype ?? "").toLowerCase();
  const category = (data.category ?? "").toLowerCase();

  if (COARSE_ADDRESS_TYPES.has(addresstype)) {
    return true;
  }

  return category === "boundary" || category === "place";
}

function isStreetLevelFeature(data: NominatimReversePayload) {
  const addresstype = (data.addresstype ?? "").toLowerCase();
  const category = (data.category ?? "").toLowerCase();
  const type = (data.type ?? "").toLowerCase();

  if (STREET_ADDRESS_TYPES.has(addresstype) || STREET_ADDRESS_TYPES.has(type)) {
    return true;
  }

  return category === "highway";
}

/**
 * Returns a street name only when Nominatim resolved a local feature
 * (street/path, or a nearby building/POI with a road).
 * Returns null for neighbourhood/city-level results even if `address.road` is filled.
 */
export function extractConfidentStreetName(data: NominatimReversePayload): string | null {
  if (isCoarseAdminResult(data)) {
    return null;
  }

  const featureName = normalizePart(data.name);
  const type = (data.type ?? "").toLowerCase();
  const addresstype = (data.addresstype ?? "").toLowerCase();

  // Prefer named paths / footways (e.g. Brauchbühlhölzli) over a different road field.
  if (
    featureName &&
    (type === "path" ||
      type === "footway" ||
      type === "track" ||
      type === "pedestrian" ||
      addresstype === "path" ||
      addresstype === "pedestrian")
  ) {
    return featureName;
  }

  const fromAddress = streetCandidateFromAddress(data.address);

  if (fromAddress) {
    return fromAddress;
  }

  if (isStreetLevelFeature(data)) {
    return featureName;
  }

  return null;
}

/**
 * Legacy rows may still store a full Nominatim `display_name`.
 * Those are not safe street labels — omit rather than show a wrong road.
 */
export function isLikelyFullGeocodeDisplayName(address: string | null | undefined) {
  const trimmed = address?.trim();

  if (!trimmed) {
    return false;
  }

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length >= 3;
}

/** Street for display/storage: confident street only, never a full geocode dump. */
export function getDisplayStreetName(address: string | null | undefined) {
  const trimmed = address?.trim();

  if (!trimmed || isLikelyFullGeocodeDisplayName(trimmed)) {
    return null;
  }

  return trimmed;
}
