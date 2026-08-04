import type { I18nLocale } from "@/lib/i18n/locales";
import { resolveI18nLocale } from "@/lib/i18n/locales";

/**
 * Localized APNs/FCM copy for a new pending Message Request.
 * Display name is already resolved (profile.name, else username).
 */
export function buildMessageRequestPushCopy(
  displayName: string,
  language: string | null | undefined
): { title: string; body: string } {
  const locale: I18nLocale = resolveI18nLocale(language);
  const name = displayName.trim() || "Someone";

  switch (locale) {
    case "ru":
      return {
        title: "Новый запрос на сообщение",
        body: `${name} хочет написать вам сообщение.`,
      };
    case "de":
      return {
        title: "Neue Nachrichtenanfrage",
        body: `${name} möchte dir eine Nachricht senden.`,
      };
    case "en":
    default:
      return {
        title: "New message request",
        body: `${name} wants to message you.`,
      };
  }
}
