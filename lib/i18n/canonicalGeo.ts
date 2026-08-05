import { CITY_LABELS_DE, CITY_LABELS_RU } from "@/lib/i18n/geoCityLabels";
import { COUNTRY_NAME_TO_SLUG, COUNTRY_SLUG_TO_CODE } from "@/lib/i18n/geoCountryCodes";
import { GEO_NAME_DE } from "@/lib/i18n/geoNameTranslationsDe";
import { GEO_NAME_RU } from "@/lib/i18n/geoNameTranslationsRu";
import { REGION_LABELS_DE, REGION_LABELS_RU } from "@/lib/i18n/geoRegionLabels";

const CYRILLIC = /[\u0400-\u04FF]/;
const LATIN_LETTERS = /[A-Za-z]/;

const SLUG_TO_COUNTRY_NAME_EN: Record<string, string> = {};
for (const [englishName, slug] of Object.entries(COUNTRY_NAME_TO_SLUG)) {
  SLUG_TO_COUNTRY_NAME_EN[slug] = englishName;
}

const ENGLISH_COUNTRY_BY_LOWER = new Map<string, string>();
for (const englishName of Object.keys(COUNTRY_NAME_TO_SLUG)) {
  ENGLISH_COUNTRY_BY_LOWER.set(englishName.toLowerCase(), englishName);
}

/** Any localized or alias country/city/region label → canonical English DB name. */
const LOCALIZED_TO_ENGLISH = new Map<string, string>();

function registerLocalizedAlias(alias: string | null | undefined, englishCanonical: string) {
  const trimmedAlias = alias?.trim();
  const trimmedEnglish = englishCanonical.trim();

  if (!trimmedAlias || !trimmedEnglish) {
    return;
  }

  LOCALIZED_TO_ENGLISH.set(trimmedAlias.toLowerCase(), trimmedEnglish);
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(value.includes("-") ? "-" : " ");
}

function findEnglishGeoName(normalizedKey: string) {
  for (const englishName of Object.keys(GEO_NAME_RU)) {
    if (englishName.toLowerCase() === normalizedKey) {
      return englishName;
    }
  }

  return titleCaseWords(normalizedKey.replace(/-/g, " "));
}

function buildReverseMaps() {
  for (const [englishName, slug] of Object.entries(COUNTRY_NAME_TO_SLUG)) {
    registerLocalizedAlias(englishName, englishName);

    const code = COUNTRY_SLUG_TO_CODE[slug];
    if (!code) {
      continue;
    }

    for (const locale of ["en", "ru", "de", "fr", "it", "es"] as const) {
      try {
        const intlName = new Intl.DisplayNames([locale], { type: "region" }).of(code);
        registerLocalizedAlias(intlName, englishName);
      } catch {
        // Intl unavailable for this locale/code pair.
      }
    }
  }

  // Official / alternate English spellings that Intl may emit for TR.
  registerLocalizedAlias("Türkiye", "Turkey");
  registerLocalizedAlias("Turkiye", "Turkey");

  for (const [englishName, localized] of Object.entries(GEO_NAME_RU)) {
    registerLocalizedAlias(localized, englishName);
  }

  for (const [englishName, localized] of Object.entries(GEO_NAME_DE)) {
    registerLocalizedAlias(localized, englishName);
  }

  for (const [regionKey, localized] of Object.entries(REGION_LABELS_RU)) {
    registerLocalizedAlias(localized, findEnglishGeoName(regionKey));
  }

  for (const [regionKey, localized] of Object.entries(REGION_LABELS_DE)) {
    registerLocalizedAlias(localized, findEnglishGeoName(regionKey));
  }

  for (const labels of [CITY_LABELS_RU, CITY_LABELS_DE]) {
    for (const [key, localized] of Object.entries(labels)) {
      const citySlug = key.includes("/") ? key.split("/").pop()! : key;
      registerLocalizedAlias(localized, findEnglishGeoName(citySlug));
    }
  }
}

buildReverseMaps();

export function containsCyrillic(value: string | null | undefined) {
  return Boolean(value && CYRILLIC.test(value));
}

export function containsLatinLetters(value: string | null | undefined) {
  return Boolean(value && LATIN_LETTERS.test(value));
}

/** Normalize any stored/displayed geo label to canonical English (DB/geocoder form). */
export function resolveCanonicalEnglishName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const byEnglishCountry = ENGLISH_COUNTRY_BY_LOWER.get(trimmed.toLowerCase());
  if (byEnglishCountry) {
    return byEnglishCountry;
  }

  const byAlias = LOCALIZED_TO_ENGLISH.get(trimmed.toLowerCase());
  if (byAlias) {
    return byAlias;
  }

  for (const englishName of Object.keys(GEO_NAME_RU)) {
    if (englishName.toLowerCase() === trimmed.toLowerCase()) {
      return englishName;
    }
  }

  return trimmed;
}

export function resolveCanonicalCountryName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const canonical = resolveCanonicalEnglishName(trimmed);
  if (!canonical) {
    return null;
  }

  return ENGLISH_COUNTRY_BY_LOWER.get(canonical.toLowerCase()) ?? canonical;
}

export function resolveCanonicalCityName(
  value: string | null | undefined,
  countryValue?: string | null
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const countryCanonical = countryValue ? resolveCanonicalCountryName(countryValue) : null;
  const canonical = resolveCanonicalEnglishName(trimmed);

  if (!canonical) {
    return null;
  }

  if (countryCanonical && canonical.toLowerCase() === countryCanonical.toLowerCase()) {
    return countryCanonical;
  }

  return canonical;
}

export function countrySlugFromAnyName(value: string | null | undefined): string | null {
  const canonical = resolveCanonicalCountryName(value);
  if (!canonical) {
    return null;
  }

  return COUNTRY_NAME_TO_SLUG[canonical] ?? null;
}

export type CanonicalSpotLocation = {
  countryNameEn: string | null;
  cityNameEn: string | null;
  countryCode: string | null;
};

export function canonicalizeSpotLocationFields(options: {
  spot_country?: string | null;
  spot_city?: string | null;
}): CanonicalSpotLocation {
  const countryNameEn = resolveCanonicalCountryName(options.spot_country);
  const cityNameEn = resolveCanonicalCityName(options.spot_city, countryNameEn);
  const slug = countryNameEn ? COUNTRY_NAME_TO_SLUG[countryNameEn] : null;
  const countryCode = slug ? (COUNTRY_SLUG_TO_CODE[slug]?.toUpperCase() ?? null) : null;

  return { countryNameEn, cityNameEn, countryCode };
}

/** Normalize geocoder / picker output before persisting to DB. */
export function canonicalizeGeoLocationFields(location: {
  country: string | null;
  city: string | null;
}) {
  const countryNameEn = resolveCanonicalCountryName(location.country);
  const cityNameEn = resolveCanonicalCityName(location.city, countryNameEn);

  return {
    country: countryNameEn,
    city: cityNameEn,
  };
}
