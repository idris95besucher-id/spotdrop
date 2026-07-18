import type { I18nLocale } from "@/lib/i18n/locales";
import { containsCyrillic } from "@/lib/i18n/canonicalGeo";

export type LocationAuditContext = {
  kind: "country" | "city" | "region" | "location-line";
  source?: string;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  slug?: string | null;
  countrySlug?: string | null;
};

/** City/country/region names must always stay Latin-script — warn if one ever slips through translated. */
export function auditLocationLocaleOutput(
  locale: I18nLocale,
  displayed: string | null | undefined,
  context: LocationAuditContext
) {
  const text = displayed?.trim();
  if (!text) {
    return;
  }

  if (containsCyrillic(text)) {
    console.warn("[i18n geo name must stay Latin script]", { displayed: text, locale, ...context });
  }
}

/** @deprecated Use auditLocationLocaleOutput */
export function auditMissingLocationTranslation(
  locale: I18nLocale,
  displayed: string | null | undefined,
  context: LocationAuditContext
) {
  auditLocationLocaleOutput(locale, displayed, context);
}
