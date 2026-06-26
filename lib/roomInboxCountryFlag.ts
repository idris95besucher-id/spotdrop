import { normalizeCountrySlug } from "@/lib/cityAttractionsCatalog";
import { COUNTRY_SLUG_TO_CODE } from "@/lib/i18n/geoCountryCodes";
import { countrySlugFromAnyName } from "@/lib/i18n/canonicalGeo";

const CITY_SLUG_TO_ISO: Record<string, string> = {
  bern: "CH",
  zurich: "CH",
  geneva: "CH",
  basel: "CH",
  lausanne: "CH",
  lugano: "CH",
  lucerne: "CH",
  "st-gallen": "CH",
  winterthur: "CH",
  berlin: "DE",
  munich: "DE",
  hamburg: "DE",
  cologne: "DE",
  frankfurt: "DE",
};

const CITY_NAME_TO_ISO: Record<string, string> = {
  bern: "CH",
  zürich: "CH",
  zurich: "CH",
  genf: "CH",
  geneva: "CH",
  genève: "CH",
  basel: "CH",
  lausanne: "CH",
  berlin: "DE",
  münchen: "DE",
  munich: "DE",
};

export type RoomInboxFlagInput = {
  countrySlug?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  citySlug?: string | null;
  cityName?: string | null;
  /** Localized display title — last-resort city hint (Messages inbox only). */
  displayTitle?: string | null;
};

function isoFromCountrySlug(slug: string | null | undefined, countryName?: string | null) {
  const raw = slug?.trim();

  if (!raw) {
    return null;
  }

  const normalizedSlug = normalizeCountrySlug(raw, countryName);

  if (normalizedSlug.length === 2) {
    return normalizedSlug.toUpperCase();
  }

  return COUNTRY_SLUG_TO_CODE[normalizedSlug]?.toUpperCase() ?? null;
}

function isoFromCountryName(countryName: string | null | undefined) {
  const raw = countryName?.trim();

  if (!raw) {
    return null;
  }

  const slug = countrySlugFromAnyName(raw);

  if (slug && COUNTRY_SLUG_TO_CODE[slug]) {
    return COUNTRY_SLUG_TO_CODE[slug].toUpperCase();
  }

  const lower = raw.toLowerCase();

  if (
    lower.includes("switzerland") ||
    lower === "schweiz" ||
    lower === "suisse" ||
    lower === "svizzera"
  ) {
    return "CH";
  }

  if (lower.includes("germany") || lower === "deutschland") {
    return "DE";
  }

  return null;
}

function isoFromCity(citySlug?: string | null, cityName?: string | null, displayTitle?: string | null) {
  const slug = citySlug?.trim().toLowerCase();

  if (slug && CITY_SLUG_TO_ISO[slug]) {
    return CITY_SLUG_TO_ISO[slug];
  }

  const name = cityName?.trim().toLowerCase();

  if (name && CITY_NAME_TO_ISO[name]) {
    return CITY_NAME_TO_ISO[name];
  }

  const title = displayTitle?.trim().toLowerCase();

  if (title && CITY_NAME_TO_ISO[title]) {
    return CITY_NAME_TO_ISO[title];
  }

  return null;
}

/** Messages inbox only — resolve ISO 3166-1 alpha-2 country code for flag image. */
export function resolveRoomInboxCountryIsoCode(input: RoomInboxFlagInput): string | null {
  const direct = input.countryCode?.trim().toUpperCase();

  if (direct && /^[A-Z]{2}$/.test(direct)) {
    return direct;
  }

  return (
    isoFromCountrySlug(input.countrySlug, input.countryName) ||
    isoFromCountryName(input.countryName) ||
    isoFromCity(input.citySlug, input.cityName, input.displayTitle)
  );
}

export function roomInboxFlagImageUrl(isoCode: string, size = 80) {
  return `https://flagcdn.com/w${size}/${isoCode.toLowerCase()}.png`;
}

export function logRoomInboxFlagDebug(input: RoomInboxFlagInput) {
  const citySlug = input.citySlug?.trim().toLowerCase();
  const cityName = input.cityName?.trim().toLowerCase();
  const displayTitle = input.displayTitle?.trim().toLowerCase();
  const isBern =
    citySlug === "bern" ||
    cityName === "bern" ||
    displayTitle === "bern";

  if (!isBern) {
    return;
  }

  const isoCode = resolveRoomInboxCountryIsoCode(input);

  console.log("[Room inbox flag] Bern row", {
    countrySlug: input.countrySlug ?? null,
    countryCode: input.countryCode ?? null,
    countryName: input.countryName ?? null,
    citySlug: input.citySlug ?? null,
    cityName: input.cityName ?? null,
    displayTitle: input.displayTitle ?? null,
    resolvedIsoCode: isoCode,
    flagUrl: isoCode ? roomInboxFlagImageUrl(isoCode) : null,
  });
}
