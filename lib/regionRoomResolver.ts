import { COUNTRY_SLUG_TO_CODE, COUNTRY_NAME_TO_SLUG } from "@/lib/i18n/geoCountryCodes";
import {
  findRegionRoomMappingBySubdivision,
  REGION_ROOM_MAPPINGS,
  type RegionRoomMapping,
} from "@/lib/regionRoomMappings";

export type GeocodeAddressDetails = Record<string, string | undefined>;

export type RegionRoomResolution = {
  countrySlug: string | null;
  countryCode: string | null;
  countryName: string | null;
  municipality: string | null;
  subdivisionCode: string | null;
  regionName: string | null;
  roomCitySlug: string | null;
  mapping: RegionRoomMapping | null;
  source: "iso" | "state" | "region" | "province" | "none";
};

function normalizeKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

const CODE_TO_SLUG = new Map(
  Object.entries(COUNTRY_SLUG_TO_CODE).map(([slug, code]) => [code.toUpperCase(), slug])
);

function resolveCountrySlug(
  address: GeocodeAddressDetails,
  countryHint?: string | null
): { countrySlug: string | null; countryCode: string | null; countryName: string | null } {
  const code = (address.country_code ?? "").trim().toUpperCase();
  const countryName = firstNonEmpty(address.country, countryHint);

  if (code && CODE_TO_SLUG.has(code)) {
    return {
      countrySlug: CODE_TO_SLUG.get(code) ?? null,
      countryCode: code,
      countryName,
    };
  }

  if (countryName) {
    const fromName = COUNTRY_NAME_TO_SLUG[countryName] ?? COUNTRY_NAME_TO_SLUG[countryName.trim()];
    if (fromName) {
      return {
        countrySlug: fromName,
        countryCode: COUNTRY_SLUG_TO_CODE[fromName]?.toUpperCase() ?? null,
        countryName,
      };
    }

    const lower = countryName.toLowerCase();
    for (const [english, slug] of Object.entries(COUNTRY_NAME_TO_SLUG)) {
      if (english.toLowerCase() === lower) {
        return {
          countrySlug: slug,
          countryCode: COUNTRY_SLUG_TO_CODE[slug]?.toUpperCase() ?? null,
          countryName,
        };
      }
    }
  }

  return { countrySlug: null, countryCode: code || null, countryName };
}

function municipalityFromAddress(address: GeocodeAddressDetails) {
  return firstNonEmpty(
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.city_district,
    address.suburb
  );
}

function isoCandidates(address: GeocodeAddressDetails) {
  return [
    address["ISO3166-2-lvl4"],
    address["ISO3166-2-lvl6"],
    address["ISO3166-2-lvl3"],
    address["ISO3166-2-lvl5"],
    address.state_code,
  ];
}

function normalizeSubdivision(raw: string | null | undefined, countryCode: string | null) {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) {
    return null;
  }

  if (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(value)) {
    return value;
  }

  if (countryCode && /^[A-Z0-9]{1,3}$/.test(value)) {
    return `${countryCode}-${value}`;
  }

  return value;
}

function findByAlias(countrySlug: string, regionLabel: string | null | undefined): RegionRoomMapping | null {
  const key = normalizeKey(regionLabel);
  if (!key) {
    return null;
  }

  const rows = REGION_ROOM_MAPPINGS.filter((row) => row.countrySlug === countrySlug);

  for (const row of rows) {
    const names = [row.regionNameEn, ...row.aliases].map(normalizeKey);
    if (names.some((name) => name && (name === key || key.includes(name) || name.includes(key)))) {
      return row;
    }
  }

  return null;
}

/**
 * Resolve country + first-level admin region → SpotDrop room city slug.
 * Does not guess from nearest city names alone.
 */
export function resolveRegionRoomFromAddress(
  address: GeocodeAddressDetails | null | undefined,
  options?: { countryHint?: string | null }
): RegionRoomResolution {
  const empty: RegionRoomResolution = {
    countrySlug: null,
    countryCode: null,
    countryName: null,
    municipality: null,
    subdivisionCode: null,
    regionName: null,
    roomCitySlug: null,
    mapping: null,
    source: "none",
  };

  if (!address) {
    return empty;
  }

  const { countrySlug, countryCode, countryName } = resolveCountrySlug(address, options?.countryHint);
  const municipality = municipalityFromAddress(address);

  if (!countrySlug) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[region-room] unresolved country", {
        country: address.country ?? null,
        country_code: address.country_code ?? null,
      });
    }
    return { ...empty, municipality, countryName, countryCode };
  }

  for (const candidate of isoCandidates(address)) {
    const subdivisionCode = normalizeSubdivision(candidate, countryCode);
    if (!subdivisionCode) {
      continue;
    }

    const mapping =
      findRegionRoomMappingBySubdivision(countryCode ?? countrySlug, subdivisionCode) ??
      findRegionRoomMappingBySubdivision(countrySlug, subdivisionCode);

    if (mapping) {
      return {
        countrySlug,
        countryCode: countryCode ?? mapping.countryCode,
        countryName,
        municipality,
        subdivisionCode: mapping.subdivisionCode,
        regionName: mapping.regionNameEn,
        roomCitySlug: mapping.roomCitySlug,
        mapping,
        source: "iso",
      };
    }
  }

  const stateLabel = firstNonEmpty(address.state, address.region, address.province);
  const byState = findByAlias(countrySlug, stateLabel);
  if (byState) {
    return {
      countrySlug,
      countryCode: countryCode ?? byState.countryCode,
      countryName,
      municipality,
      subdivisionCode: byState.subdivisionCode,
      regionName: byState.regionNameEn,
      roomCitySlug: byState.roomCitySlug,
      mapping: byState,
      source: address.state ? "state" : address.region ? "region" : "province",
    };
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[region-room] unresolved subdivision", {
      countrySlug,
      state: address.state ?? null,
      region: address.region ?? null,
      province: address.province ?? null,
      iso: address["ISO3166-2-lvl4"] ?? null,
      municipality,
    });
  }

  return {
    countrySlug,
    countryCode,
    countryName,
    municipality,
    subdivisionCode: null,
    regionName: null,
    roomCitySlug: null,
    mapping: null,
    source: "none",
  };
}

/** Deterministic fixtures for routing tests (no network). */
export const REGION_ROOM_ROUTING_FIXTURES: Array<{
  label: string;
  address: GeocodeAddressDetails;
  expectedCountrySlug: string;
  expectedRoomCitySlug: string;
  expectedSubdivisionCode: string;
}> = [
  {
    label: "Interlaken",
    address: {
      country: "Switzerland",
      country_code: "ch",
      town: "Interlaken",
      state: "Bern",
      "ISO3166-2-lvl4": "CH-BE",
    },
    expectedCountrySlug: "switzerland",
    expectedRoomCitySlug: "bern",
    expectedSubdivisionCode: "CH-BE",
  },
  {
    label: "Thun",
    address: {
      country: "Switzerland",
      country_code: "ch",
      town: "Thun",
      state: "Bern",
      "ISO3166-2-lvl4": "CH-BE",
    },
    expectedCountrySlug: "switzerland",
    expectedRoomCitySlug: "bern",
    expectedSubdivisionCode: "CH-BE",
  },
  {
    label: "Biel/Bienne",
    address: {
      country: "Switzerland",
      country_code: "ch",
      city: "Biel/Bienne",
      state: "Bern",
      "ISO3166-2-lvl4": "CH-BE",
    },
    expectedCountrySlug: "switzerland",
    expectedRoomCitySlug: "bern",
    expectedSubdivisionCode: "CH-BE",
  },
  {
    label: "Kriens",
    address: {
      country: "Switzerland",
      country_code: "ch",
      town: "Kriens",
      state: "Luzern",
      "ISO3166-2-lvl4": "CH-LU",
    },
    expectedCountrySlug: "switzerland",
    expectedRoomCitySlug: "lucerne",
    expectedSubdivisionCode: "CH-LU",
  },
  {
    label: "San Diego",
    address: {
      country: "United States",
      country_code: "us",
      city: "San Diego",
      state: "California",
      "ISO3166-2-lvl4": "US-CA",
    },
    expectedCountrySlug: "united-states",
    expectedRoomCitySlug: "california",
    expectedSubdivisionCode: "US-CA",
  },
  {
    label: "Los Angeles",
    address: {
      country: "United States",
      country_code: "us",
      city: "Los Angeles",
      state: "California",
      "ISO3166-2-lvl4": "US-CA",
    },
    expectedCountrySlug: "united-states",
    expectedRoomCitySlug: "california",
    expectedSubdivisionCode: "US-CA",
  },
  {
    label: "New York City",
    address: {
      country: "United States",
      country_code: "us",
      city: "New York",
      state: "New York",
      "ISO3166-2-lvl4": "US-NY",
    },
    expectedCountrySlug: "united-states",
    expectedRoomCitySlug: "new-york",
    expectedSubdivisionCode: "US-NY",
  },
  {
    label: "Nürnberg",
    address: {
      country: "Germany",
      country_code: "de",
      city: "Nürnberg",
      state: "Bayern",
      "ISO3166-2-lvl4": "DE-BY",
    },
    expectedCountrySlug: "germany",
    expectedRoomCitySlug: "bayern",
    expectedSubdivisionCode: "DE-BY",
  },
  {
    label: "München",
    address: {
      country: "Germany",
      country_code: "de",
      city: "München",
      state: "Bayern",
      "ISO3166-2-lvl4": "DE-BY",
    },
    expectedCountrySlug: "germany",
    expectedRoomCitySlug: "bayern",
    expectedSubdivisionCode: "DE-BY",
  },
  {
    label: "Nice",
    address: {
      country: "France",
      country_code: "fr",
      city: "Nice",
      state: "Provence-Alpes-Côte d'Azur",
      "ISO3166-2-lvl4": "FR-PAC",
    },
    expectedCountrySlug: "france",
    expectedRoomCitySlug: "provence-alpes-cote-dazur",
    expectedSubdivisionCode: "FR-PAC",
  },
  {
    label: "Milano",
    address: {
      country: "Italy",
      country_code: "it",
      city: "Milano",
      state: "Lombardia",
      "ISO3166-2-lvl4": "IT-25",
    },
    expectedCountrySlug: "italy",
    expectedRoomCitySlug: "lombardia",
    expectedSubdivisionCode: "IT-25",
  },
];
