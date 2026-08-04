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
};

function pickLocalized(
  locale: I18nLocale,
  en: string | null | undefined,
  ru: string | null | undefined,
  de: string | null | undefined
): string | null {
  const enValue = typeof en === "string" && en.trim() ? en.trim() : null;
  const ruValue = typeof ru === "string" && ru.trim() ? ru.trim() : null;
  const deValue = typeof de === "string" && de.trim() ? de.trim() : null;

  if (locale === "ru") {
    return ruValue ?? enValue;
  }

  if (locale === "de") {
    return deValue ?? enValue;
  }

  return enValue;
}

/** Resolve title/body/link label for a viewer locale with RU/DE → EN fallback. */
export function resolveOfficialChannelLocalizedFields(
  post: OfficialChannelLocaleSource,
  language: string | null | undefined
): OfficialChannelLocalizedFields {
  const locale = resolveI18nLocale(language);
  const body =
    pickLocalized(locale, post.body_en, post.body_ru, post.body_de) ?? post.body_en.trim();

  return {
    title: pickLocalized(locale, post.title_en, post.title_ru, post.title_de),
    body,
    linkLabel: pickLocalized(locale, post.link_label_en, post.link_label_ru, post.link_label_de),
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

export function requireEnglishBody(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("BODY_EN_REQUIRED");
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw new Error("TEXT_TOO_LONG");
  }

  return trimmed;
}
