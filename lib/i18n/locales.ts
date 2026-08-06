import { isAppLanguageCode, type AppLanguageCode } from "@/lib/languages";

export const I18N_LOCALES = ["en", "ru", "de"] as const;
export type I18nLocale = (typeof I18N_LOCALES)[number];

export function isI18nLocale(value: string | null | undefined): value is I18nLocale {
  return value === "en" || value === "ru" || value === "de";
}

export function resolveI18nLocale(code: string | null | undefined): I18nLocale {
  if (isI18nLocale(code)) {
    return code;
  }

  return "en";
}

/** Map device/browser language to a supported app locale (ru/de → match, else en). */
export function detectDeviceI18nLocale(): I18nLocale {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const candidates: string[] = [];

  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    for (const entry of navigator.languages) {
      if (typeof entry === "string" && entry.trim()) {
        candidates.push(entry);
      }
    }
  } else if (typeof navigator.language === "string" && navigator.language.trim()) {
    candidates.push(navigator.language);
  }

  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();

    if (normalized === "ru" || normalized.startsWith("ru-")) {
      return "ru";
    }

    if (normalized === "de" || normalized.startsWith("de-")) {
      return "de";
    }

    if (normalized === "en" || normalized.startsWith("en-")) {
      return "en";
    }
  }

  return "en";
}

export function appLanguageToI18nLocale(code: AppLanguageCode | string | null | undefined): I18nLocale {
  if (code === "ru" || code === "de") {
    return code;
  }

  return "en";
}

export function isSupportedAppLanguageForI18n(code: string): code is AppLanguageCode {
  return isAppLanguageCode(code) && (code === "en" || code === "ru" || code === "de");
}
