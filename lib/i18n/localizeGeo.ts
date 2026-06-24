import type { I18nLocale } from "@/lib/i18n/locales";
import {
  countrySlugFromAnyName,
  resolveCanonicalCityName,
  resolveCanonicalCountryName,
  resolveCanonicalEnglishName,
} from "@/lib/i18n/canonicalGeo";
import { CITY_LABELS_DE, CITY_LABELS_RU } from "@/lib/i18n/geoCityLabels";
import { GEO_NAME_DE } from "@/lib/i18n/geoNameTranslationsDe";
import { GEO_NAME_RU } from "@/lib/i18n/geoNameTranslationsRu";
import { REGION_LABELS_DE, REGION_LABELS_RU } from "@/lib/i18n/geoRegionLabels";
import { COUNTRY_NAME_TO_SLUG, COUNTRY_SLUG_TO_CODE } from "@/lib/i18n/geoCountryCodes";
import { auditLocationLocaleOutput } from "@/lib/i18n/localizeGeoAudit";

const regionDisplayNames: Partial<Record<I18nLocale, Intl.DisplayNames>> = {};

function normalizeGeoKey(value: string) {
  return value.trim().toLowerCase();
}

function englishNameToSlug(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
}

function buildCaseInsensitiveMap(source: Record<string, string>) {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    map.set(key.toLowerCase(), value);
  }
  return map;
}

const GEO_NAME_RU_LC = buildCaseInsensitiveMap(GEO_NAME_RU);
const GEO_NAME_DE_LC = buildCaseInsensitiveMap(GEO_NAME_DE);

function lookupNameTranslation(locale: I18nLocale, englishName: string) {
  const trimmed = englishName.trim();
  const table = locale === "ru" ? GEO_NAME_RU : locale === "de" ? GEO_NAME_DE : null;
  const tableLc = locale === "ru" ? GEO_NAME_RU_LC : locale === "de" ? GEO_NAME_DE_LC : null;

  return table?.[trimmed] ?? tableLc?.get(trimmed.toLowerCase()) ?? null;
}

function lookupRegionTranslation(locale: I18nLocale, englishName: string) {
  const table = locale === "ru" ? REGION_LABELS_RU : locale === "de" ? REGION_LABELS_DE : null;
  return table?.[normalizeGeoKey(englishName)] ?? null;
}

function findCityKeyByEnglishName(englishName: string, countrySlug?: string | null) {
  const slug = englishNameToSlug(englishName);
  if (!slug) {
    return null;
  }

  if (countrySlug) {
    const keyed = `${countrySlug}/${slug}`;
    if (CITY_LABELS_RU[keyed] || CITY_LABELS_DE[keyed]) {
      return keyed;
    }
  }

  const matches = Object.keys(CITY_LABELS_RU).filter((key) => key.endsWith(`/${slug}`));
  if (matches.length === 1) {
    return matches[0]!;
  }

  if (countrySlug) {
    return `${countrySlug}/${slug}`;
  }

  return matches[0] ?? null;
}

function finalizeLocalizedLabel(
  locale: I18nLocale,
  result: string,
  fallback: string,
  context: {
    kind: "country" | "city" | "region";
    source: string;
    country?: string | null;
    slug?: string | null;
    countrySlug?: string | null;
  }
) {
  const value = result?.trim() || fallback;
  auditLocationLocaleOutput(locale, value, context);
  return value;
}

function getRegionDisplayNames(locale: I18nLocale) {
  if (locale === "en") {
    return null;
  }

  if (!regionDisplayNames[locale]) {
    try {
      regionDisplayNames[locale] = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      regionDisplayNames[locale] = undefined;
    }
  }

  return regionDisplayNames[locale] ?? null;
}

export type GeoLabelInput = {
  slug?: string | null;
  name: string;
  countrySlug?: string | null;
  countryCode?: string | null;
};

export function localizeCountryName(locale: I18nLocale, input: GeoLabelInput): string {
  const canonical = resolveCanonicalCountryName(input.name) ?? input.name?.trim() ?? "";
  if (!canonical) {
    return "";
  }

  if (locale === "en") {
    auditLocationLocaleOutput(locale, canonical, {
      kind: "country",
      source: "localizeCountryName",
      slug: input.slug ?? null,
    });
    return canonical;
  }

  const slug =
    input.slug?.trim().toLowerCase() ??
    countrySlugFromAnyName(canonical) ??
    COUNTRY_NAME_TO_SLUG[canonical] ??
    null;
  const code = (input.countryCode ?? (slug ? COUNTRY_SLUG_TO_CODE[slug] : null))?.toUpperCase();
  const intlName = code ? getRegionDisplayNames(locale)?.of(code)?.trim() : null;
  const dictionaryName = lookupNameTranslation(locale, canonical);
  const result = intlName || dictionaryName || canonical;

  return finalizeLocalizedLabel(locale, result, canonical, {
    kind: "country",
    source: "localizeCountryName",
    slug,
  });
}

export function localizeCityName(locale: I18nLocale, input: GeoLabelInput): string {
  const canonical = resolveCanonicalEnglishName(input.name) ?? input.name?.trim() ?? "";
  if (!canonical) {
    return "";
  }

  if (locale === "en") {
    auditLocationLocaleOutput(locale, canonical, {
      kind: "city",
      source: "localizeCityName",
      slug: input.slug ?? null,
      countrySlug: input.countrySlug ?? null,
      country: input.countrySlug ?? null,
    });
    return canonical;
  }

  const countrySlug = input.countrySlug?.trim().toLowerCase() ?? "";
  const citySlug = input.slug?.trim().toLowerCase() ?? "";
  const key = countrySlug && citySlug ? `${countrySlug}/${citySlug}` : citySlug;

  const table = locale === "ru" ? CITY_LABELS_RU : locale === "de" ? CITY_LABELS_DE : null;
  const localized =
    table?.[key] ??
    (citySlug ? table?.[citySlug] : undefined) ??
    lookupNameTranslation(locale, canonical);

  return finalizeLocalizedLabel(locale, localized ?? canonical, canonical, {
    kind: "city",
    source: "localizeCityName",
    slug: citySlug || null,
    countrySlug: countrySlug || null,
    country: input.countrySlug ?? null,
  });
}

export function localizeCountryByEnglishName(locale: I18nLocale, englishName: string | null | undefined) {
  const trimmed = englishName?.trim();
  if (!trimmed) {
    return null;
  }

  const canonical = resolveCanonicalCountryName(trimmed) ?? trimmed;
  const slug = countrySlugFromAnyName(canonical) ?? COUNTRY_NAME_TO_SLUG[canonical] ?? null;
  return localizeCountryName(locale, { name: canonical, slug });
}

export function localizeCityByEnglishName(
  locale: I18nLocale,
  englishName: string | null | undefined,
  countryEnglishName?: string | null
) {
  const trimmed = englishName?.trim();
  if (!trimmed) {
    return null;
  }

  const countryCanonical = countryEnglishName
    ? resolveCanonicalCountryName(countryEnglishName)
    : null;
  const canonical = resolveCanonicalCityName(trimmed, countryCanonical) ?? resolveCanonicalEnglishName(trimmed) ?? trimmed;

  if (locale === "en") {
    auditLocationLocaleOutput(locale, canonical, {
      kind: "city",
      source: "localizeCityByEnglishName",
      country: countryCanonical,
    });
    return canonical;
  }

  const countrySlug = countryCanonical ? countrySlugFromAnyName(countryCanonical) : null;
  const cityKey = findCityKeyByEnglishName(canonical, countrySlug);

  if (cityKey) {
    const [keyCountrySlug, keyCitySlug] = cityKey.split("/");
    return localizeCityName(locale, {
      name: canonical,
      slug: keyCitySlug,
      countrySlug: keyCountrySlug,
    });
  }

  const byName = lookupNameTranslation(locale, canonical);
  if (byName) {
    return finalizeLocalizedLabel(locale, byName, canonical, {
      kind: "city",
      source: "localizeCityByEnglishName",
      country: countryCanonical ?? null,
      countrySlug,
    });
  }

  return finalizeLocalizedLabel(locale, canonical, canonical, {
    kind: "city",
    source: "localizeCityByEnglishName.fallback",
    country: countryCanonical ?? null,
    countrySlug,
  });
}

export function localizeRegionName(
  locale: I18nLocale,
  englishName: string | null | undefined,
  countryEnglishName?: string | null
) {
  const trimmed = englishName?.trim();
  if (!trimmed) {
    return null;
  }

  const countryCanonical = countryEnglishName
    ? resolveCanonicalCountryName(countryEnglishName)
    : null;
  const canonical = resolveCanonicalEnglishName(trimmed) ?? trimmed;

  if (locale === "en") {
    auditLocationLocaleOutput(locale, canonical, {
      kind: "region",
      source: "localizeRegionName",
      country: countryCanonical ?? null,
    });
    return canonical;
  }

  const byRegion = lookupRegionTranslation(locale, canonical);
  if (byRegion) {
    return finalizeLocalizedLabel(locale, byRegion, canonical, {
      kind: "region",
      source: "localizeRegionName",
      country: countryCanonical ?? null,
    });
  }

  const byCity = localizeCityByEnglishName(locale, canonical, countryCanonical);
  if (byCity && byCity !== canonical) {
    return byCity;
  }

  return finalizeLocalizedLabel(locale, canonical, canonical, {
    kind: "region",
    source: "localizeRegionName.fallback",
    country: countryCanonical ?? null,
  });
}

export function localizeRegionByEnglishName(
  locale: I18nLocale,
  englishName: string | null | undefined,
  countryEnglishName?: string | null
) {
  return localizeRegionName(locale, englishName, countryEnglishName);
}

/** Localize country/city strings stored on spots (English DB / geocoder names). */
export function localizeGeoText(
  locale: I18nLocale,
  value: string | null | undefined,
  kind: "country" | "city",
  hints?: { countrySlug?: string | null; citySlug?: string | null; countryCode?: string | null }
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (locale === "en") {
    const canonical =
      kind === "country"
        ? resolveCanonicalCountryName(trimmed) ?? trimmed
        : resolveCanonicalEnglishName(trimmed) ?? trimmed;
    auditLocationLocaleOutput(locale, canonical, {
      kind,
      source: "localizeGeoText",
      slug: hints?.citySlug ?? hints?.countrySlug ?? null,
      countrySlug: hints?.countrySlug ?? null,
    });
    return canonical;
  }

  if (kind === "country") {
    return localizeCountryName(locale, {
      name: trimmed,
      slug: hints?.countrySlug ?? null,
      countryCode: hints?.countryCode ?? null,
    });
  }

  return localizeCityName(locale, {
    name: trimmed,
    slug: hints?.citySlug ?? null,
    countrySlug: hints?.countrySlug ?? null,
  });
}

/** Localize region/canton strings from addresses or spot metadata. */
export function localizeGeoRegionText(
  locale: I18nLocale,
  value: string | null | undefined,
  countryEnglishName?: string | null
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const countryCanonical = countryEnglishName
    ? resolveCanonicalCountryName(countryEnglishName)
    : null;
  const canonical = resolveCanonicalEnglishName(trimmed) ?? trimmed;

  if (locale === "en") {
    auditLocationLocaleOutput(locale, canonical, {
      kind: "region",
      source: "localizeGeoRegionText",
      country: countryCanonical ?? null,
    });
    return canonical;
  }

  return localizeRegionName(locale, canonical, countryCanonical);
}
