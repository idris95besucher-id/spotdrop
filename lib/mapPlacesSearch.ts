import { canonicalizeGeoLocationFields } from "@/lib/i18n/canonicalGeo";

export type MapPlaceKind = "country" | "city" | "street" | "address" | "poi" | "other";

/** MapLibre-friendly bounds: [west, south, east, north]. */
export type MapPlaceBounds = [number, number, number, number];

export type MapPlaceSearchResult = {
  id: string;
  /** Primary line in the results list. */
  name: string;
  /** Secondary line: city/region, country (no flags). */
  subtitle: string;
  /** Single-line summary for the search field after selection. */
  label: string;
  latitude: number;
  longitude: number;
  kind: MapPlaceKind;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  bounds: MapPlaceBounds | null;
  geometry: GeoJSON.Geometry | null;
};

type NominatimSearchItem = {
  place_id?: number;
  osm_id?: number;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  boundingbox?: [string, string, string, string];
  geojson?: GeoJSON.Geometry;
  address?: Record<string, string | undefined>;
};

/** Round coordinates for fingerprint identity (~110m at equator). */
const COORD_IDENTITY_DECIMALS = 3;

function cityFromAddress(address: Record<string, string | undefined> | undefined) {
  if (!address) {
    return null;
  }

  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    null
  );
}

function regionFromAddress(address: Record<string, string | undefined> | undefined) {
  if (!address) {
    return null;
  }

  return address.state ?? address.region ?? address.county ?? null;
}

function parseBounds(boundingbox: NominatimSearchItem["boundingbox"]): MapPlaceBounds | null {
  if (!boundingbox || boundingbox.length !== 4) {
    return null;
  }

  const south = Number.parseFloat(boundingbox[0]);
  const north = Number.parseFloat(boundingbox[1]);
  const west = Number.parseFloat(boundingbox[2]);
  const east = Number.parseFloat(boundingbox[3]);

  if (![south, north, west, east].every(Number.isFinite)) {
    return null;
  }

  return [west, south, east, north];
}

function classifyPlace(item: NominatimSearchItem): MapPlaceKind {
  const addressType = (item.addresstype ?? "").toLowerCase();
  const placeClass = (item.class ?? "").toLowerCase();
  const placeType = (item.type ?? "").toLowerCase();

  if (addressType === "country" || placeType === "country") {
    return "country";
  }

  if (
    addressType === "city" ||
    addressType === "town" ||
    addressType === "village" ||
    addressType === "municipality" ||
    addressType === "state" ||
    addressType === "county" ||
    placeType === "city" ||
    placeType === "town" ||
    placeType === "village" ||
    placeType === "administrative" ||
    (placeClass === "boundary" && placeType === "administrative") ||
    (placeClass === "place" &&
      ["city", "town", "village", "municipality", "suburb", "hamlet"].includes(placeType))
  ) {
    return "city";
  }

  if (placeClass === "highway" || addressType === "road" || placeType === "residential") {
    return "street";
  }

  if (
    addressType === "house" ||
    addressType === "building" ||
    placeClass === "building" ||
    placeType === "house" ||
    Boolean(item.address?.house_number)
  ) {
    return "address";
  }

  if (
    placeClass === "amenity" ||
    placeClass === "tourism" ||
    placeClass === "leisure" ||
    placeClass === "natural" ||
    placeClass === "aeroway" ||
    placeClass === "historic" ||
    placeClass === "shop" ||
    placeType === "airport" ||
    placeType === "park" ||
    placeType === "lake"
  ) {
    return "poi";
  }

  return "other";
}

function primaryName(item: NominatimSearchItem, kind: MapPlaceKind, city: string | null) {
  const named = item.name?.trim();

  if (named) {
    return named;
  }

  const address = item.address;

  if (kind === "country" && address?.country) {
    return address.country;
  }

  if (kind === "city") {
    return city ?? item.display_name?.split(",")[0]?.trim() ?? "Place";
  }

  if (kind === "street" && address?.road) {
    return address.road;
  }

  if (kind === "address") {
    const road = address?.road;
    const number = address?.house_number;

    if (road && number) {
      return `${road} ${number}`;
    }

    if (road) {
      return road;
    }
  }

  return item.display_name?.split(",")[0]?.trim() ?? "Place";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (!left || !right) {
    return left === right;
  }

  return left === right;
}

/** Secondary line: locality + country, never flags, never repeating the place name. */
function formatSubtitle(
  kind: MapPlaceKind,
  name: string,
  city: string | null,
  region: string | null,
  country: string | null
) {
  if (kind === "country") {
    return "";
  }

  if (kind === "city") {
    return country?.trim() ?? "";
  }

  const locality =
    city && !sameText(city, name)
      ? city
      : region && !sameText(region, name)
        ? region
        : null;

  const parts: string[] = [];

  if (locality) {
    parts.push(locality.trim());
  }

  if (country?.trim()) {
    parts.push(country.trim());
  }

  return parts.join(", ");
}

function formatLabel(name: string, subtitle: string) {
  if (!subtitle) {
    return name;
  }

  return `${name}, ${subtitle}`;
}

function isAreaKind(kind: MapPlaceKind) {
  return kind === "city" || kind === "country";
}

function roundCoord(value: number) {
  const factor = 10 ** COORD_IDENTITY_DECIMALS;
  return (Math.round(value * factor) / factor).toFixed(COORD_IDENTITY_DECIMALS);
}

/** Stable Nominatim / OSM ids — ignore synthetic lat-lon fallbacks. */
function stablePlaceId(id: string | null | undefined) {
  const trimmed = (id ?? "").trim();

  // Nominatim place_id / osm_id are numeric. Synthetic ids include decimals/dashes.
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Normalized place identity:
 * - prefer stable place ID when available
 * - otherwise title + city + country + rounded coordinates
 */
export function mapPlaceIdentityKey(place: MapPlaceSearchResult) {
  const id = stablePlaceId(place.id);

  if (id) {
    return `id:${id}`;
  }

  return [
    normalizeText(place.name),
    normalizeText(place.city),
    normalizeText(place.country),
    roundCoord(place.latitude),
    roundCoord(place.longitude),
  ].join("|");
}

/** Content fingerprint so near-identical Nominatim rows with different ids still collapse. */
function mapPlaceContentFingerprint(place: MapPlaceSearchResult) {
  return [
    normalizeText(place.name),
    normalizeText(place.city),
    normalizeText(place.country),
    roundCoord(place.latitude),
    roundCoord(place.longitude),
  ].join("|");
}

function preferPlace(current: MapPlaceSearchResult, candidate: MapPlaceSearchResult) {
  if (!current.geometry && candidate.geometry) {
    return candidate;
  }

  if (current.geometry && !candidate.geometry) {
    return current;
  }

  if (!current.bounds && candidate.bounds) {
    return candidate;
  }

  return current;
}

/**
 * Drop duplicate places while preserving first-seen order.
 * Same place ID, or same title+city+country+rounded coords, counts as one result.
 * Different cities (e.g. Bernstrasse in Bern vs Ostermundigen vs Schlieren) stay.
 */
export function dedupeMapPlaces(results: MapPlaceSearchResult[]) {
  const kept: MapPlaceSearchResult[] = [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  for (const result of results) {
    const idKey = stablePlaceId(result.id);
    const fingerprint = mapPlaceContentFingerprint(result);

    if (idKey && seenIds.has(idKey)) {
      const existingIndex = kept.findIndex((item) => stablePlaceId(item.id) === idKey);

      if (existingIndex >= 0) {
        kept[existingIndex] = preferPlace(kept[existingIndex]!, result);
      }

      continue;
    }

    if (seenFingerprints.has(fingerprint)) {
      const existingIndex = kept.findIndex(
        (item) => mapPlaceContentFingerprint(item) === fingerprint
      );

      if (existingIndex >= 0) {
        kept[existingIndex] = preferPlace(kept[existingIndex]!, result);
      }

      continue;
    }

    if (idKey) {
      seenIds.add(idKey);
    }

    seenFingerprints.add(fingerprint);
    kept.push(result);
  }

  return kept;
}

/**
 * Global places search for the live map (countries, cities, streets, addresses, POIs).
 * Same-name places in different cities/countries are kept; identical place ids
 * or title+city+country+rounded-coordinate fingerprints are collapsed.
 */
export async function searchMapPlaces(query: string, limit = 12): Promise<{
  results: MapPlaceSearchResult[];
  error: string | null;
}> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return { results: [], error: null };
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("limit", String(Math.min(Math.max(limit * 2, 1), 24)));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("polygon_geojson", "1");
    url.searchParams.set("dedupe", "0");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      return { results: [], error: "Place search is unavailable." };
    }

    const data = (await response.json()) as NominatimSearchItem[];
    const results: MapPlaceSearchResult[] = [];

    for (const item of data) {
      const latitude = Number.parseFloat(item.lat ?? "");
      const longitude = Number.parseFloat(item.lon ?? "");

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        continue;
      }

      const address = item.address ?? {};
      const cityRaw = cityFromAddress(address);
      const regionRaw = regionFromAddress(address);
      const canonical = canonicalizeGeoLocationFields({
        city: cityRaw,
        country: address.country ?? null,
      });
      const countryCode = address.country_code?.trim().toUpperCase() || null;
      const kind = classifyPlace(item);
      const name = primaryName(item, kind, canonical.city);
      const region = regionRaw?.trim() || null;
      const city = kind === "city" ? null : canonical.city;
      const subtitle = formatSubtitle(kind, name, city ?? canonical.city, region, canonical.country);
      const bounds = parseBounds(item.boundingbox);
      const geometry =
        isAreaKind(kind) && item.geojson && (item.geojson.type === "Polygon" || item.geojson.type === "MultiPolygon")
          ? item.geojson
          : null;

      results.push({
        id: String(item.place_id ?? item.osm_id ?? `${latitude}-${longitude}-${results.length}`),
        name,
        subtitle,
        label: formatLabel(name, subtitle),
        latitude,
        longitude,
        kind,
        city: city ?? canonical.city,
        region,
        country: canonical.country,
        countryCode,
        bounds,
        geometry,
      });
    }

    return {
      results: dedupeMapPlaces(results).slice(0, limit),
      error: null,
    };
  } catch {
    return { results: [], error: "Place search is unavailable." };
  }
}

export function mapPlaceZoomForKind(kind: MapPlaceKind) {
  switch (kind) {
    case "country":
      return 5.5;
    case "city":
      return 12;
    case "street":
      return 16;
    case "address":
      return 17;
    case "poi":
      return 16;
    default:
      return 14;
  }
}
