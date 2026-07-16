import { isDeviceOnline } from "@/lib/deviceOnline";
import { isRetryableUploadError, type UploadErrorKind } from "@/lib/storageUpload";

export type RetryAttemptInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorKind: UploadErrorKind | "unknown";
  message: string;
};

const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

function backoffDelayMs(attempt: number) {
  // attempt is 1-indexed for the retry that's about to happen: 1s, 2s, 4s, capped at 8s,
  // plus up to 300ms of jitter so multiple concurrent uploads (primary + cover) don't all
  // retry in lockstep against the same flaky connection.
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  const jitter = Math.random() * 300;
  return exponential + jitter;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted.", "AbortError"));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Upload aborted.", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Waits for the `online` event if we're currently offline, instead of burning a retry attempt immediately. */
function waitForConnectivity(signal?: AbortSignal, maxWaitMs = 15_000): Promise<void> {
  if (isDeviceOnline()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("online", onOnline);
      signal?.removeEventListener("abort", onAbortResolve);
      resolve();
    };

    const onOnline = () => finish();
    const onAbortResolve = () => finish();

    const timeoutId = window.setTimeout(finish, maxWaitMs);
    window.addEventListener("online", onOnline, { once: true });
    signal?.addEventListener("abort", onAbortResolve, { once: true });
  });
}

/**
 * Retries `attempt` with exponential backoff, but only for errors flagged retryable by
 * `isRetryableUploadError` (transient network/timeout/5xx) — never for auth/RLS/4xx errors,
 * and never once `signal` has been aborted (a manual retry or navigation supersedes this run).
 *
 * `attempt` is called with `attemptNumber` (1-indexed) so the caller can pass
 * `isRetryAttempt: attemptNumber > 1` through to `uploadFileToStorageWithProgress` — that's
 * what makes a 409-after-network-error on attempt 2+ resolve as success instead of failure.
 */
export async function retryUpload<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  options: {
    maxAttempts?: number;
    signal?: AbortSignal;
    onRetry?: (info: RetryAttemptInfo) => void;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("Upload aborted.", "AbortError");
    }

    try {
      return await attempt(attemptNumber);
    } catch (caught) {
      lastError = caught;

      const errorKind = (caught as { errorKind?: UploadErrorKind })?.errorKind;
      const isAbort = caught instanceof DOMException && caught.name === "AbortError";

      if (isAbort || !isRetryableUploadError(caught) || attemptNumber >= maxAttempts) {
        throw caught;
      }

      const delayMs = backoffDelayMs(attemptNumber);

      options.onRetry?.({
        attempt: attemptNumber + 1,
        maxAttempts,
        delayMs,
        errorKind: errorKind ?? "unknown",
        message: caught instanceof Error ? caught.message : String(caught),
      });

      console.warn(`[upload-retry] attempt ${attemptNumber} failed (${errorKind ?? "unknown"}) — retrying in ${Math.round(delayMs)}ms`, {
        message: caught instanceof Error ? caught.message : String(caught),
      });

      await waitForConnectivity(options.signal);
      await sleep(delayMs, options.signal);
    }
  }

  throw lastError;
}
