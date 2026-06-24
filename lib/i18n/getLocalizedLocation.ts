import type { I18nLocale } from "@/lib/i18n/locales";
import {
  canonicalizeGeoLocationFields,
  canonicalizeSpotLocationFields,
  resolveCanonicalCityName,
  resolveCanonicalCountryName,
} from "@/lib/i18n/canonicalGeo";
import {
  localizeCityByEnglishName,
  localizeCityName,
  localizeCountryByEnglishName,
  localizeCountryName,
  localizeRegionByEnglishName,
  localizeRegionName,
  type GeoLabelInput,
} from "@/lib/i18n/localizeGeo";

export type LocalizedCountryInput = GeoLabelInput;
export type LocalizedCityInput = GeoLabelInput;

/** Central API: localize a country for display. */
export function getLocalizedCountryName(locale: I18nLocale, input: LocalizedCountryInput): string {
  return localizeCountryName(locale, input);
}

/** Central API: localize a city/room for display. */
export function getLocalizedCityName(locale: I18nLocale, input: LocalizedCityInput): string {
  return localizeCityName(locale, input);
}

/** Central API: localize a region/canton/state for display. */
export function getLocalizedRegionName(
  locale: I18nLocale,
  englishName: string | null | undefined,
  countryEnglishName?: string | null
): string | null {
  return localizeRegionName(locale, englishName, countryEnglishName);
}

/** Localize by English DB / geocoder string (spots, profiles). */
export function getLocalizedCountryByName(locale: I18nLocale, englishName: string | null | undefined) {
  return localizeCountryByEnglishName(locale, englishName);
}

export function getLocalizedCityByName(
  locale: I18nLocale,
  englishName: string | null | undefined,
  countryEnglishName?: string | null
) {
  return localizeCityByEnglishName(locale, englishName, countryEnglishName);
}

export function getLocalizedRegionByName(
  locale: I18nLocale,
  englishName: string | null | undefined,
  countryEnglishName?: string | null
) {
  return localizeRegionByEnglishName(locale, englishName, countryEnglishName);
}

export {
  canonicalizeGeoLocationFields,
  canonicalizeSpotLocationFields,
  resolveCanonicalCityName,
  resolveCanonicalCountryName,
};
