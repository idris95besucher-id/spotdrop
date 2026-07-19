/**
 * Structured server-side push diagnostics. Search Vercel logs for `[PushServer]`.
 */
export function pushServerLog(
  step: string,
  message: string,
  detail?: Record<string, unknown>
) {
  if (detail) {
    console.info(`[PushServer][step ${step}] ${message}`, detail);
  } else {
    console.info(`[PushServer][step ${step}] ${message}`);
  }
}

export function pushServerError(
  step: string,
  message: string,
  detail?: Record<string, unknown>
) {
  if (detail) {
    console.error(`[PushServer][step ${step}] FAIL ${message}`, detail);
  } else {
    console.error(`[PushServer][step ${step}] FAIL ${message}`);
  }
}

export function tokenPreview(token: string | null | undefined, chars = 16) {
  if (!token) {
    return null;
  }
  return `${token.slice(0, chars)}…(len=${token.length})`;
}

export function formatFcmError(error: unknown) {
  const err = error as {
    code?: string;
    message?: string;
    errorInfo?: { code?: string; message?: string };
    stack?: string;
  };

  return {
    code: err?.code ?? err?.errorInfo?.code ?? "unknown",
    message: err?.message ?? err?.errorInfo?.message ?? String(error),
    errorInfoCode: err?.errorInfo?.code ?? null,
    errorInfoMessage: err?.errorInfo?.message ?? null,
    stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 4).join(" | ") : null,
  };
}
