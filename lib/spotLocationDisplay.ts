import type { I18nLocale } from "@/lib/i18n/locales";
import { canonicalizeSpotLocationFields } from "@/lib/i18n/canonicalGeo";
import {
  localizeCityByEnglishName,
  localizeCountryByEnglishName,
  localizeRegionByEnglishName,
} from "@/lib/i18n/localizeGeo";
import { auditLocationLocaleOutput } from "@/lib/i18n/localizeGeoAudit";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { getDisplayStreetName } from "@/lib/spotStreetName";

export type SpotLocationDisplayFields = {
  id?: string | null;
  user_id?: string | null;
  content_kind?: string | null;
  spot_name?: string | null;
  spot_address?: string | null;
  spot_city?: string | null;
  spot_country?: string | null;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  placeName?: string | null;
};

function uniqueLocationParts(parts: Array<string | null | undefined>) {
  const result: string[] = [];

  for (const part of parts) {
    const trimmed = part?.trim();

    if (!trimmed) {
      continue;
    }

    if (result.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      continue;
    }

    result.push(trimmed);
  }

  return result;
}

function localizeSpotCityField(
  locale: I18nLocale,
  city: string | null | undefined,
  country: string | null | undefined
) {
  const { countryNameEn, cityNameEn } = canonicalizeSpotLocationFields({
    spot_country: country,
    spot_city: city,
  });

  if (!cityNameEn) {
    return null;
  }

  return (
    localizeCityByEnglishName(locale, cityNameEn, countryNameEn ?? country) ??
    localizeRegionByEnglishName(locale, cityNameEn, countryNameEn ?? country) ??
    cityNameEn
  );
}

function localizeSpotCountryField(locale: I18nLocale, country: string | null | undefined) {
  const { countryNameEn } = canonicalizeSpotLocationFields({ spot_country: country });

  if (!countryNameEn) {
    return null;
  }

  return localizeCountryByEnglishName(locale, countryNameEn) ?? countryNameEn;
}

/** Street, City, Country — or City, Country when street is not confident. */
export function formatSpotLocationDisplay(
  post: SpotLocationDisplayFields,
  locale: I18nLocale = "en"
) {
  const street = getDisplayStreetName(post.spot_address);
  const localizedCity = localizeSpotCityField(locale, post.spot_city, post.spot_country);
  const localizedCountry = localizeSpotCountryField(locale, post.spot_country);

  const parts = uniqueLocationParts([
    post.spot_name,
    post.placeName,
    street,
    localizedCity,
    localizedCountry,
  ]);

  if (parts.length > 0) {
    const line = parts.join(", ");
    auditLocationLocaleOutput(locale, line, {
      kind: "location-line",
      source: "formatSpotLocationDisplay",
      city: post.spot_city ?? null,
      country: post.spot_country ?? null,
    });
    return line;
  }

  return null;
}

export function formatSpotLocationShortLocalized(
  post: SpotLocationDisplayFields,
  locale: I18nLocale
) {
  return formatSpotLocationShort(post, locale);
}

export function formatSpotLocationLabelLocalized(location: SpotGeoLocation, locale: I18nLocale) {
  const street = getDisplayStreetName(location.address);
  const city = localizeSpotCityField(locale, location.city, location.country);
  const country = localizeSpotCountryField(locale, location.country);
  const parts = uniqueLocationParts([street, city, country]);

  if (parts.length > 0) {
    const line = parts.join(", ");
    auditLocationLocaleOutput(locale, line, {
      kind: "location-line",
      source: "formatSpotLocationLabelLocalized",
      city: location.city ?? null,
      country: location.country ?? null,
    });
    return line;
  }

  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

/** Short card/viewer label from captured GPS: "City, Country" (no long address). */
export function formatSpotGeoLocationShortLabel(location: SpotGeoLocation, locale: I18nLocale) {
  return (
    formatSpotLocationShort(
      {
        spot_city: location.city,
        spot_country: location.country,
        spot_address: location.address,
      },
      locale
    ) ?? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
  );
}

/** Instagram-style short location label for spots: "City, Country". */
export function formatSpotLocationShort(
  post: SpotLocationDisplayFields,
  locale: I18nLocale = "en"
) {
  const localizedCity = localizeSpotCityField(locale, post.spot_city, post.spot_country);
  const localizedCountry = localizeSpotCountryField(locale, post.spot_country);
  const parts = uniqueLocationParts([localizedCity, localizedCountry]);

  if (parts.length > 0) {
    const line = parts.join(", ");
    auditLocationLocaleOutput(locale, line, {
      kind: "location-line",
      source: "formatSpotLocationShort",
      city: post.spot_city ?? null,
      country: post.spot_country ?? null,
    });
    return line;
  }

  return null;
}

/**
 * Heuristic region/canton inference from a comma-separated address string.
 * Example: "Street, 3011 Bern, Bern, Switzerland" -> "Bern"
 */
export function inferSpotRegionFromAddress(options: {
  address: string | null | undefined;
  city: string | null | undefined;
  country: string | null | undefined;
}) {
  const raw = options.address?.trim();
  if (!raw) {
    return null;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const city = options.city?.trim().toLowerCase() ?? null;
  const country = options.country?.trim().toLowerCase() ?? null;

  const cityIndex = city ? parts.findIndex((part) => part.toLowerCase().includes(city)) : -1;
  const countryIndex = country ? parts.findIndex((part) => part.toLowerCase() === country) : -1;

  const endIndex = countryIndex > 0 ? countryIndex : parts.length;
  const startIndex = cityIndex >= 0 ? cityIndex + 1 : 0;

  const between = parts.slice(startIndex, endIndex).filter(Boolean);

  if (between.length === 0) {
    return null;
  }

  const candidate = between[between.length - 1]!;
  if (candidate && options.city && candidate.toLowerCase().includes(options.city.toLowerCase())) {
    return null;
  }

  return candidate || null;
}

export function hasSpotCoordinates(post: SpotLocationDisplayFields) {
  const latitude = Number(post.spot_latitude);
  const longitude = Number(post.spot_longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

export function hasSpotLocationData(post: SpotLocationDisplayFields) {
  return Boolean(formatSpotLocationDisplay(post) || hasSpotCoordinates(post));
}

export function isSpotContent(post: Pick<SpotLocationDisplayFields, "content_kind" | "spot_latitude" | "spot_longitude">) {
  if (post.content_kind === "story") {
    return false;
  }

  return post.content_kind === "spot" || hasSpotCoordinates(post);
}

export function shouldShowSpotLocation(post: SpotLocationDisplayFields) {
  if (!isSpotContent(post) && post.content_kind && post.content_kind !== "spot") {
    return hasSpotLocationData(post);
  }

  return isSpotContent(post) && hasSpotLocationData(post);
}

export function buildSpotMapsUrl(post: SpotLocationDisplayFields) {
  const latitude = Number(post.spot_latitude);
  const longitude = Number(post.spot_longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  const query = formatSpotLocationDisplay(post);

  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return null;
}
