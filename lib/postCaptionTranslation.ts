import { supabase } from "@/lib/supabaseClient";
import type { I18nLocale } from "@/lib/i18n/locales";

export type TranslatePostCaptionResult = {
  translatedText: string | null;
  error: string | null;
};

/**
 * On-demand translation of a post's canonical (always-English) caption into
 * the viewer's current app language, via the translate-post-caption Edge
 * Function — cached server-side by post_id + language, keyed by a hash of
 * the source caption so an edit never serves a stale translation.
 */
export async function translatePostCaption(
  postId: string,
  language: I18nLocale
): Promise<TranslatePostCaptionResult> {
  const trimmedId = postId.trim();

  if (!trimmedId) {
    return { translatedText: null, error: "Missing post id." };
  }

  const { data, error } = await supabase.functions.invoke("translate-post-caption", {
    body: { postId: trimmedId, language },
  });

  if (error) {
    return { translatedText: null, error: error.message || "Unable to translate this caption." };
  }

  const payload = data as { translatedText?: string | null; error?: string } | null;

  if (payload?.error) {
    return { translatedText: null, error: payload.error };
  }

  return { translatedText: payload?.translatedText ?? null, error: null };
}
