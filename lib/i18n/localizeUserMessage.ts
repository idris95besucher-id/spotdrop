import type { I18nLocale } from "@/lib/i18n/locales";
import { I18N_MESSAGES, translateMessage, type TranslationKey } from "@/lib/i18n/messages";
import { isTechnicalErrorMessage, toUserFacingError } from "@/lib/userFacingError";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

let reverseMap: Record<string, TranslationKey> | null = null;

function getReverseMap() {
  if (!reverseMap) {
    reverseMap = {};

    for (const [key, value] of Object.entries(I18N_MESSAGES.en)) {
      reverseMap[value] = key as TranslationKey;
    }
  }

  return reverseMap;
}

/** Re-export for backward compatibility. */
export function localizeError(t: TranslateFn, message: string | null | undefined): string | null {
  return localizeUserMessage(t, message);
}

/**
 * Map known English catalog strings to the active locale.
 * Technical / Supabase messages become a generic localized fallback.
 */
export function localizeUserMessage(t: TranslateFn, message: string | null | undefined): string | null {
  if (!message) {
    return null;
  }

  const key = getReverseMap()[message];

  if (key) {
    return t(key);
  }

  if (isTechnicalErrorMessage(message)) {
    return t("common.somethingWentWrong");
  }

  return message;
}

export function localizeUserMessageForLocale(
  locale: I18nLocale,
  message: string | null | undefined
): string | null {
  if (!message) {
    return null;
  }

  const key = getReverseMap()[message];

  if (key) {
    return translateMessage(locale, key);
  }

  if (isTechnicalErrorMessage(message)) {
    return translateMessage(locale, "common.somethingWentWrong");
  }

  return message;
}

/** Prefer this when assigning setError(...) from catch / Supabase results. */
export function localizeCaughtError(
  t: TranslateFn,
  error: unknown,
  fallbackKey: TranslationKey = "common.somethingWentWrong"
) {
  const fallbackEn =
    (I18N_MESSAGES.en as Record<string, string>)[fallbackKey] ??
    "Something went wrong. Please try again.";
  const safe = toUserFacingError(error, fallbackEn);
  return localizeUserMessage(t, safe) ?? t(fallbackKey);
}
