export type AppLanguageCode =
  | "en"
  | "de"
  | "ru"
  | "fr"
  | "it"
  | "es"
  | "tr"
  | "ar"
  | "pt"
  | "uk";

export type AppLanguage = {
  code: AppLanguageCode;
  label: string;
  nativeLabel: string;
  dir: "ltr" | "rtl";
};

export const DEFAULT_LANGUAGE: AppLanguageCode = "en";

export const APP_LANGUAGES: AppLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr" },
  { code: "de", label: "German", nativeLabel: "Deutsch", dir: "ltr" },
  { code: "ru", label: "Russian", nativeLabel: "Русский", dir: "ltr" },
  { code: "fr", label: "French", nativeLabel: "Français", dir: "ltr" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", dir: "ltr" },
  { code: "es", label: "Spanish", nativeLabel: "Español", dir: "ltr" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", dir: "ltr" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", dir: "ltr" },
  { code: "uk", label: "Ukrainian", nativeLabel: "Українська", dir: "ltr" },
];

export function isAppLanguageCode(value: string): value is AppLanguageCode {
  return APP_LANGUAGES.some((language) => language.code === value);
}

export function getAppLanguage(code: string | null | undefined): AppLanguage {
  if (code && isAppLanguageCode(code)) {
    return APP_LANGUAGES.find((language) => language.code === code) ?? APP_LANGUAGES[0];
  }

  return APP_LANGUAGES[0];
}

export function applyDocumentLanguage(code: AppLanguageCode) {
  if (typeof document === "undefined") {
    return;
  }

  const language = getAppLanguage(code);
  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;
}
