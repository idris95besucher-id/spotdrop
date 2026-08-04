/**
 * Spot publish diagnostics — keep real Supabase/storage errors visible while debugging.
 */

export type SpotPublishFailStep =
  | "validate_media"
  | "validate_location"
  | "auth"
  | "prepare_media"
  | "upload_primary"
  | "upload_extra"
  | "moderate_photo"
  | "create_post"
  | "fetch_post"
  | "save_media_items"
  | "collection"
  | "unknown";

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  statusCode?: string | number;
  status?: number;
  name?: string;
};

export function formatSupabasePublishError(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error instanceof Error) {
    const extra = error as Error & SupabaseLikeError;
    return [
      extra.message,
      extra.code ? `code=${extra.code}` : null,
      extra.details ? `details=${extra.details}` : null,
      extra.hint ? `hint=${extra.hint}` : null,
      extra.statusCode != null ? `status=${extra.statusCode}` : null,
      extra.status != null ? `status=${extra.status}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  const maybe = error as SupabaseLikeError & { error?: string };

  return [
    maybe.message ?? maybe.error ?? JSON.stringify(error),
    maybe.code ? `code=${maybe.code}` : null,
    maybe.details ? `details=${maybe.details}` : null,
    maybe.hint ? `hint=${maybe.hint}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function spotPublishFail(
  step: SpotPublishFailStep,
  error: unknown,
  extra?: Record<string, unknown>
): string {
  const formatted = formatSupabasePublishError(error);
  const message = `[SPOT PUBLISH] step=${step} | ${formatted}`;

  console.error(message, extra ?? null);

  return message;
}

export function logSpotPublishStep(
  step: SpotPublishFailStep | string,
  payload?: Record<string, unknown>
) {
  console.log(`[SPOT PUBLISH] step=${step}`, payload ?? {});
}

/** Prefer the raw publish/diagnostic message for UI — do not sanitize away. */
export function publishErrorForUi(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return formatSupabasePublishError(error) || "Unable to publish spot.";
}
