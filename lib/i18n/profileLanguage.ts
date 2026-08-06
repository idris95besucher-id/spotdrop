import { resolveI18nLocale, type I18nLocale } from "@/lib/i18n/locales";
import { writeStoredAppLocale } from "@/lib/i18n/appLocaleStorage";
import { supabase } from "@/lib/supabaseClient";

export async function loadProfileLanguage(userId: string): Promise<I18nLocale | null> {
  const { data, error } = await supabase.from("profiles").select("language").eq("id", userId).maybeSingle();

  if (error) {
    if (error.code === "42703") {
      return null;
    }

    console.error("Failed to load profile language:", error);
    return null;
  }

  const language = (data as { language?: string | null } | null)?.language;
  return language ? resolveI18nLocale(language) : null;
}

export async function saveProfileLanguage(userId: string, locale: I18nLocale) {
  writeStoredAppLocale(locale);

  const { error } = await supabase.from("profiles").update({ language: locale }).eq("id", userId);

  if (error?.code === "42703") {
    return null;
  }

  if (error) {
    return error.message;
  }

  await supabase.auth.updateUser({ data: { locale } });
  return null;
}
