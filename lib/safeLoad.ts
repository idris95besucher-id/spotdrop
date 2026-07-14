import { isTechnicalErrorMessage } from "@/lib/userFacingError";

/** Serialize unknown errors so console output is actionable (avoids `{}` from Errors / odd proxies). */
function serializeLoadError(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null;
  }

  if (error instanceof Error) {
    const payload = {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
    const line = JSON.stringify(payload, null, 2);
    if (payload.message || payload.stack) {
      return line;
    }
    return null;
  }

  if (typeof error === "object") {
    try {
      const line = JSON.stringify(error, null, 2);
      if (line === "{}" || line === "[]" || line === "null") {
        return null;
      }
      return line;
    } catch {
      const fallback = String(error);
      return fallback.trim() ? fallback : null;
    }
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    const fallback = String(error);
    return fallback.trim() ? fallback : null;
  }
}

/** Logs load failures with structured output; skips null / empty payloads (no `{}` noise). */
export function logExactLoadError(error: unknown): void {
  const serialized = serializeLoadError(error);
  if (serialized === null) {
    return;
  }
  console.error("Load error:", serialized);
}

/**
 * For read-only list queries: never surface raw engine errors in the UI.
 */
export function userFacingSupabaseListError(
  error: { message?: string | null } | null | undefined
): string | null {
  if (error == null) {
    return null;
  }
  const msg = typeof error.message === "string" ? error.message.trim() : "";
  if (!msg) {
    return null;
  }
  if (isTechnicalErrorMessage(msg)) {
    return null;
  }
  return msg;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
