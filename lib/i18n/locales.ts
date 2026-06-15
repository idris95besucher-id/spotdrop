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

export function appLanguageToI18nLocale(code: AppLanguageCode | string | null | undefined): I18nLocale {
  if (code === "ru" || code === "de") {
    return code;
  }

  return "en";
}

export function isSupportedAppLanguageForI18n(code: string): code is AppLanguageCode {
  return isAppLanguageCode(code) && (code === "en" || code === "ru" || code === "de");
}
