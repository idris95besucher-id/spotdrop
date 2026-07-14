/**
 * Sanitize unknown errors for user-facing UI.
 * Never surface raw Supabase / Postgres / JWT / stack strings.
 */

const TECHNICAL_ERROR_RE =
  /\b(pgrst|jwt|postgres|postgrest|supabase|permission denied|row-level security|violates|sqlstate|stack|errno|econn|etimedout|fetch failed|networkerror|authapierror|storageapierror|schema cache|json object requested|could not find the|relation .* does not exist|column .* does not exist|duplicate key value|foreign key|check constraint)\b/i;

const LOOKS_LIKE_CODE_RE = /^[A-Z]{2,}[0-9]{2,}|^[a-z]+_[a-z0-9_]+$/i;

export const GENERIC_USER_ERROR_EN = "Something went wrong. Please try again.";

export function extractErrorText(error: unknown): string {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error.trim();
  }

  if (error instanceof Error) {
    return error.message.trim();
  }

  const maybe = error as { message?: unknown; error_description?: unknown; error?: unknown };

  if (typeof maybe.message === "string" && maybe.message.trim()) {
    return maybe.message.trim();
  }

  if (typeof maybe.error_description === "string" && maybe.error_description.trim()) {
    return maybe.error_description.trim();
  }

  if (typeof maybe.error === "string" && maybe.error.trim()) {
    return maybe.error.trim();
  }

  return "";
}

/** True when the message looks like a raw engine / API / network error. */
export function isTechnicalErrorMessage(message: string): boolean {
  const trimmed = message.trim();

  if (!trimmed) {
    return true;
  }

  if (TECHNICAL_ERROR_RE.test(trimmed)) {
    return true;
  }

  if (LOOKS_LIKE_CODE_RE.test(trimmed) && trimmed.length < 48) {
    return true;
  }

  if (trimmed.includes("·") && /\b(code|http)\b/i.test(trimmed)) {
    return true;
  }

  if (/run database\//i.test(trimmed) || /\.sql\b/i.test(trimmed)) {
    return true;
  }

  if (/\b(rls|policy|supabase sql)\b/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Returns a safe string for UI. Prefer stable English catalog messages when
 * the input is already friendly; otherwise use `fallback`.
 */
export function toUserFacingError(
  error: unknown,
  fallback: string = GENERIC_USER_ERROR_EN
): string {
  const text = extractErrorText(error);

  if (!text) {
    return fallback;
  }

  if (isTechnicalErrorMessage(text)) {
    return fallback;
  }

  return text;
}
