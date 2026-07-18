import { isDeviceOnline } from "@/lib/deviceOnline";
import { isRetryableUploadError, type UploadErrorKind } from "@/lib/storageUpload";

export type RetryAttemptInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorKind: UploadErrorKind | "unknown";
  message: string;
};

/** Diagnostics mode: no automatic retries — fail fast with the exact error. */
const DEFAULT_MAX_ATTEMPTS = 1;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 4000;

function backoffDelayMs(attempt: number) {
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

function describeUploadError(caught: unknown) {
  const asError = caught as {
    message?: string;
    name?: string;
    errorKind?: UploadErrorKind;
    statusCode?: string | number;
    diagnostics?: unknown;
    stack?: string;
  } | null;

  return {
    name: asError?.name ?? (caught instanceof Error ? caught.name : typeof caught),
    message: asError?.message ?? (caught instanceof Error ? caught.message : String(caught)),
    errorKind: asError?.errorKind ?? null,
    statusCode: asError?.statusCode ?? null,
    diagnostics: asError?.diagnostics ?? null,
    stack: asError?.stack ?? (caught instanceof Error ? caught.stack : null),
  };
}

/**
 * Retries `attempt` only for true network / offline failures (`isRetryableUploadError`).
 * Never retries 413, auth, permanent 4xx, stalls, timeouts, or 5xx — those must surface
 * immediately so the same large video is not re-sent in a loop.
 *
 * `attempt` is called with `attemptNumber` (1-indexed) so the caller can pass
 * `isRetryAttempt: attemptNumber > 1` through to `uploadFileToStorageWithProgress` — that's
 * what makes a 409-after-network-error on attempt 2 resolve as success instead of failure.
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

      const details = describeUploadError(caught);
      const isAbort = caught instanceof DOMException && caught.name === "AbortError";
      const retryable = !isAbort && isRetryableUploadError(caught);

      console.error(`[upload-retry] attempt ${attemptNumber}/${maxAttempts} failed`, {
        ...details,
        willRetry: retryable && attemptNumber < maxAttempts,
        online: isDeviceOnline(),
      });

      if (isAbort || !retryable || attemptNumber >= maxAttempts) {
        throw caught;
      }

      const delayMs = backoffDelayMs(attemptNumber);

      options.onRetry?.({
        attempt: attemptNumber + 1,
        maxAttempts,
        delayMs,
        errorKind: details.errorKind ?? "unknown",
        message: details.message,
      });

      console.warn(
        `[upload-retry] network error — retrying once with the same file in ${Math.round(delayMs)}ms`,
        details
      );

      await waitForConnectivity(options.signal);
      await sleep(delayMs, options.signal);
    }
  }

  throw lastError;
}
