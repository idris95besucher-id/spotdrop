import type { I18nLocale } from "@/lib/i18n/locales";
import { containsCyrillic, containsLatinLetters } from "@/lib/i18n/canonicalGeo";

export type LocationAuditContext = {
  kind: "country" | "city" | "region" | "location-line";
  source?: string;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  slug?: string | null;
  countrySlug?: string | null;
};

export { containsLatinLetters };

export function auditLocationLocaleOutput(
  locale: I18nLocale,
  displayed: string | null | undefined,
  context: LocationAuditContext
) {
  const text = displayed?.trim();
  if (!text) {
    return;
  }

  if (locale === "en" && containsCyrillic(text)) {
    console.warn("[i18n wrong locale output]", { displayed: text, locale, ...context });
    return;
  }

  if (locale === "ru" && containsLatinLetters(text)) {
    console.warn("[i18n missing Russian translation]", { displayed: text, locale, ...context });
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
