import { resolveI18nLocale, type I18nLocale } from "@/lib/i18n/locales";

export type OfficialChannelLocalizedFields = {
  title: string | null;
  body: string;
  linkLabel: string | null;
};

export type OfficialChannelLocaleSource = {
  title_en?: string | null;
  body_en: string;
  title_ru?: string | null;
  body_ru?: string | null;
  title_de?: string | null;
  body_de?: string | null;
  link_label_en?: string | null;
  link_label_ru?: string | null;
  link_label_de?: string | null;
  /** Locale the admin originally wrote in (en/ru/de). */
  source_locale?: string | null;
};

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Fallback: requested locale → source locale → en → any non-empty variant.
 */
function pickLocalized(
  locale: I18nLocale,
  sourceLocale: I18nLocale | null,
  en: string | null | undefined,
  ru: string | null | undefined,
  de: string | null | undefined
): string | null {
  const byLocale: Record<I18nLocale, string | null> = {
    en: nonEmpty(en),
    ru: nonEmpty(ru),
    de: nonEmpty(de),
  };

  return (
    byLocale[locale] ??
    (sourceLocale ? byLocale[sourceLocale] : null) ??
    byLocale.en ??
    byLocale.ru ??
    byLocale.de
  );
}

function resolveSourceLocale(
  post: OfficialChannelLocaleSource
): I18nLocale | null {
  const raw = post.source_locale;
  if (raw === "en" || raw === "ru" || raw === "de") {
    return raw;
  }
  return null;
}

/** Resolve title/body/link label for the active app locale (I18nProvider). */
export function resolveOfficialChannelLocalizedFields(
  post: OfficialChannelLocaleSource,
  language: string | null | undefined
): OfficialChannelLocalizedFields {
  const locale = resolveI18nLocale(language);
  const sourceLocale = resolveSourceLocale(post);
  const body =
    pickLocalized(locale, sourceLocale, post.body_en, post.body_ru, post.body_de) ??
    post.body_en.trim();

  return {
    title: pickLocalized(locale, sourceLocale, post.title_en, post.title_ru, post.title_de),
    body,
    linkLabel: pickLocalized(
      locale,
      sourceLocale,
      post.link_label_en,
      post.link_label_ru,
      post.link_label_de
    ),
  };
}

export function isAllowedHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeOptionalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!isAllowedHttpsUrl(trimmed)) {
    throw new Error("INVALID_LINK_URL");
  }

  return trimmed;
}

export function trimOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error("TEXT_TOO_LONG");
  }

  return trimmed;
}

/** Body is required; language may be en, ru, or de (detected server-side). */
export function requireAnnouncementBody(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("BODY_REQUIRED");
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw new Error("TEXT_TOO_LONG");
  }

  return trimmed;
}

/** @deprecated Use requireAnnouncementBody — kept for older call sites. */
export function requireEnglishBody(value: unknown, maxLength: number): string {
  return requireAnnouncementBody(value, maxLength);
}
