import { mapAuthError } from "@/lib/authMessages";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { TranslationKey } from "@/lib/i18n/messages";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function mapAuthErrorI18n(t: TranslateFn, error: unknown, fallbackKey: TranslationKey = "error.connection") {
  const english = mapAuthError(error, I18N_FALLBACK_EN[fallbackKey] ?? "Connection problem. Please try again.");

  return localizeUserMessage(t, english) ?? t(fallbackKey);
}

const I18N_FALLBACK_EN: Partial<Record<TranslationKey, string>> = {
  "error.connection": "Connection problem. Please try again.",
  "auth.error.createAccountFailed": "Unable to create your account. Please try again.",
  "auth.error.registrationFailed": "Registration failed. Please try again.",
  "auth.error.unableUpdatePassword": "Unable to update your password. Please try again.",
};
