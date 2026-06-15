import type { I18nLocale } from "@/lib/i18n/locales";
import { I18N_MESSAGES, translateMessage, type TranslationKey } from "@/lib/i18n/messages";

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

export function localizeUserMessage(t: TranslateFn, message: string | null | undefined): string | null {
  if (!message) {
    return null;
  }

  const key = getReverseMap()[message];

  return key ? t(key) : message;
}

export function localizeUserMessageForLocale(locale: I18nLocale, message: string | null | undefined): string | null {
  if (!message) {
    return null;
  }

  const key = getReverseMap()[message];

  return key ? translateMessage(locale, key) : message;
}
