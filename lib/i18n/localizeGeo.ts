import type { I18nLocale } from "@/lib/i18n/locales";
import {
  countrySlugFromAnyName,
  resolveCanonicalCityName,
  resolveCanonicalCountryName,
  resolveCanonicalEnglishName,
} from "@/lib/i18n/canonicalGeo";
import { auditLocationLocaleOutput } from "@/lib/i18n/localizeGeoAudit";

export type GeoLabelInput = {
  slug?: string | null;
  name: string;
  countrySlug?: string | null;
  countryCode?: string | null;
};

/**
 * City, country, and region names are never translated — they always stay in their canonical
 * Latin-script name (e.g. "Bern", "Switzerland", "Moscow") no matter which UI locale is active.
 * Only the surrounding interface text goes through t(). `locale` stays on these signatures for
 * call-site compatibility and the Latin-script audit log, not because it changes the output.
 */

export function localizeCountryName(locale: I18nLocale, input: GeoLabelInput): string {
  const canonical = resolveCanonicalCountryName(input.name) ?? input.name?.trim() ?? "";
  if (!canonical) {
    return "";
  }

  auditLocationLocaleOutput(locale, canonical, {
    kind: "country",
    source: "localizeCountryName",
    slug: input.slug ?? null,
  });

  return canonical;
}

export function localizeCityName(locale: I18nLocale, input: GeoLabelInput): string {
  const canonical = resolveCanonicalEnglishName(input.name) ?? input.name?.trim() ?? "";
  if (!canonical) {
    return "";
  }

  auditLocationLocaleOutput(locale, canonical, {
    kind: "city",
    source: "localizeCityName",
    slug: input.slug ?? null,
    countrySlug: input.countrySlug ?? null,
    country: input.countrySlug ?? null,
  });

  return canonical;
}

export function localizeCountryByEnglishName(locale: I18nLocale, englishName: string | null | undefined) {
  const trimmed = englishName?.trim();
  if (!trimmed) {
    return null;
  }

  const canonical = resolveCanonicalCountryName(trimmed) ?? trimmed;
  const slug = countrySlugFromAnyName(canonical) ?? null;
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

  auditLocationLocaleOutput(locale, canonical, {
    kind: "city",
    source: "localizeCityByEnglishName",
    country: countryCanonical ?? null,
  });

  return canonical;
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

  auditLocationLocaleOutput(locale, canonical, {
    kind: "region",
    source: "localizeRegionName",
    country: countryCanonical ?? null,
  });

  return canonical;
}

export function localizeRegionByEnglishName(
  locale: I18nLocale,
  englishName: string | null | undefined,
  countryEnglishName?: string | null
) {
  return localizeRegionName(locale, englishName, countryEnglishName);
}

/** Localize country/city strings stored on spots (English DB / geocoder names). Always returns the Latin-script canonical name. */
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

/** Localize region/canton strings from addresses or spot metadata. Always returns the Latin-script canonical name. */
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

  return localizeRegionName(locale, trimmed, countryCanonical);
}
