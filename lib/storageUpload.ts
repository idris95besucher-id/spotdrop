import type { StorageError } from "@supabase/storage-js";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/lib/supabaseClient";
import { logUploadLifecycleEvent } from "@/lib/uploadLifecycleTrace";

export const AVATARS_BUCKET = "avatars" as const;
export const POST_MEDIA_BUCKET = "post-media" as const;

export const NOT_SIGNED_IN_UPLOAD_MESSAGE = "Please sign in to upload files.";

export function logUploadError(error: unknown) {
  const storageError = error as StorageError | null;

  console.error("Upload failed:", {
    message: storageError?.message ?? (error instanceof Error ? error.message : String(error)),
    statusCode: storageError && "statusCode" in storageError ? storageError.statusCode : undefined,
    name: storageError?.name ?? (error instanceof Error ? error.name : undefined),
  });
}

export async function requireAuthenticatedUser(expectedUserId?: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(NOT_SIGNED_IN_UPLOAD_MESSAGE);
  }

  if (expectedUserId && user.id !== expectedUserId) {
    throw new Error(NOT_SIGNED_IN_UPLOAD_MESSAGE);
  }

  return user;
}

export function assertAvatarsBucket(bucket: string): asserts bucket is typeof AVATARS_BUCKET {
  if (bucket !== AVATARS_BUCKET) {
    throw new Error(`Invalid storage bucket "${bucket}". Use avatars.`);
  }
}

export function assertPostMediaBucket(bucket: string): asserts bucket is typeof POST_MEDIA_BUCKET {
  if (bucket !== POST_MEDIA_BUCKET) {
    throw new Error(`Invalid storage bucket "${bucket}". Use post-media.`);
  }
}

const TOKEN_REFRESH_MARGIN_MS = 60_000;

/**
 * Returns the current session's access token, proactively refreshing first if it's within
 * a minute of expiring — a long video upload can easily outlast a token that was already
 * close to expiry when the publish flow started. Never returns the anon key; returns null
 * if there is truly no session, so callers can surface a real "please sign in again" error
 * instead of silently degrading to an unauthenticated request.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  const isNearExpiry = expiresAtMs > 0 && expiresAtMs - Date.now() < TOKEN_REFRESH_MARGIN_MS;

  if (!isNearExpiry) {
    return session.access_token;
  }

  console.log("[storage-upload] access token near expiry — refreshing before upload", {
    expiresAt: new Date(expiresAtMs).toISOString(),
  });

  const { data: refreshed, error } = await supabase.auth.refreshSession();

  if (error || !refreshed.session) {
    console.error("[storage-upload] session refresh failed — using existing token", error);
    return session.access_token;
  }

  return refreshed.session.access_token;
}

export type StorageUploadProgressCallback = (percent: number) => void;

export type RawStorageUploadResult = {
  path: string;
  /** True when the object already existed (see the 409-on-retry handling below) — not a fresh write. */
  alreadyExisted?: boolean;
};

/**
 * Why an upload failure is or isn't safe to retry automatically. Kept as a
 * discriminated tag (rather than re-parsing the message) so retry logic and
 * user-facing copy can both branch on it without guessing.
 */
export type UploadErrorKind =
  | "no-internet"
  | "timeout"
  | "stalled"
  | "network"
  | "aborted"
  | "auth"
  | "file-too-large"
  | "http-retryable"
  | "http-permanent";

export type UploadDiagnostics = {
  requestId: string;
  bucket: string;
  storagePath: string;
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadStartedAt: string;
  elapsedMs: number;
  bytesSent: number;
  online: boolean;
  readyState: number;
  httpStatus: number;
  aborted: boolean;
  timedOut: boolean;
};

export type StorageUploadError = Error & {
  errorKind: UploadErrorKind;
  statusCode?: string | number;
  diagnostics: UploadDiagnostics;
};

/**
 * Only true transport dropouts are auto-retried. Never retry 413 / auth / permanent 4xx /
 * stalls / timeouts / 5xx — those either need a smaller file (already compressed once) or a
 * user-triggered retry, and re-sending the same large video multiple times is what made
 * Spot uploads feel endlessly stuck.
 */
function isRetryableErrorKind(kind: UploadErrorKind) {
  return kind === "no-internet" || kind === "network";
}

export function isRetryableUploadError(error: unknown): boolean {
  const kind = (error as { errorKind?: UploadErrorKind } | null)?.errorKind;
  return kind ? isRetryableErrorKind(kind) : false;
}

/**
 * No progress events for this long is treated as a dead connection. Sized generously so a
 * slow-but-alive cellular upload of a 15s 1080p Spot is not aborted mid-transfer (the old
 * 20s stall window caused abort → full re-upload loops that looked like endless retries).
 */
const STALL_TIMEOUT_MS = 90_000;
/**
 * Hard backstop for a single attempt against a connection that never errors and never
 * technically stalls (bytes still trickle in occasionally) but is effectively too slow to
 * ever finish. This is deliberately generous and, as of this fix, the *only* wall-clock
 * ceiling anywhere in the upload path — there is intentionally no separate whole-pipeline
 * timeout above this (see CreateSpotForm.tsx's handlePublish for why that was removed).
 */
const ABSOLUTE_MAX_UPLOAD_MS = 5 * 60 * 1000;

/**
 * Uploads a File/Blob straight to Supabase Storage's REST endpoint via
 * `XMLHttpRequest`, instead of going through `supabase-js`'s `.upload()`.
 *
 * Why: `supabase-js` sends the request with `fetch()`, and `fetch()` has no
 * cross-platform way to observe upload (request body) progress — only
 * download progress. That's why the app could previously only ever report
 * "0%" then "100%" once the whole transfer had already finished, regardless
 * of file size. `XMLHttpRequest.upload.onprogress` *does* fire incrementally
 * as bytes leave the device, giving real byte-level progress — and here it
 * also drives stall detection (see STALL_TIMEOUT_MS below).
 *
 * This sends the exact same request `supabase-js` sends for a browser
 * File/Blob upload (verified against the installed `@supabase/storage-js`
 * build): `POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}`, multipart
 * `FormData` with a `cacheControl` field and the file appended under an
 * empty field name, `apikey` + `Authorization: Bearer <token>` headers, and
 * `x-upsert` reflecting the upsert option. No manual `Content-Type` header —
 * the browser sets the multipart boundary itself.
 */
export function uploadFileToStorageWithProgress(
  bucket: string,
  path: string,
  file: File | Blob,
  options: {
    accessToken?: string;
    cacheControl?: string;
    upsert?: boolean;
    onProgress?: StorageUploadProgressCallback;
    signal?: AbortSignal;
    /** Marks this as a retry of a previous attempt against the same path — see the 409 handling below. */
    isRetryAttempt?: boolean;
    /** Ties every log line for this attempt back to one upload — see lib/uploadLifecycleTrace.ts. */
    requestId?: string;
  } = {}
): Promise<RawStorageUploadResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Missing Supabase configuration for storage upload."));
  }

  // Never silently fall back to the anon key for an authenticated upload — storage RLS on
  // post-media requires an authenticated caller, so an anon-key request would just fail RLS
  // with a confusing permission error instead of the real "your session expired" reason.
  if (!options.accessToken) {
    const authError = new Error("Your session has expired. Please sign in again.") as StorageUploadError;
    authError.errorKind = "auth";
    authError.diagnostics = {
      requestId: options.requestId ?? "(no-request-id)",
      bucket,
      storagePath: path,
      url: "",
      fileName: file instanceof File ? file.name : "(blob)",
      fileSize: file.size,
      fileType: file.type,
      uploadStartedAt: new Date().toISOString(),
      elapsedMs: 0,
      bytesSent: 0,
      online: isDeviceOnline(),
      readyState: 0,
      httpStatus: 0,
      aborted: false,
      timedOut: false,
    };
    return Promise.reject(authError);
  }

  const storageBaseUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `${storageBaseUrl}/object/${bucket}/${encodedPath}`;

  const formData = new FormData();
  formData.append("cacheControl", options.cacheControl ?? "3600");
  formData.append("", file);

  const fileName = file instanceof File ? file.name : "(blob)";
  const fileSize = file.size;
  const fileType = file.type;
  const requestId = options.requestId ?? "(no-request-id)";
  const uploadStartedAtMs = performance.now();
  const uploadStartedAtIso = new Date().toISOString();
  let lastProgressAtMs = uploadStartedAtMs;
  let bytesSent = 0;

  return new Promise<RawStorageUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let abortedByStall = false;
    let abortedByAbsoluteTimeout = false;
    let abortedByCaller = false;

    logUploadLifecycleEvent("xhr-created", {
      requestId,
      bucket,
      storagePath: path,
      fileName,
      fileSize,
      fileType,
      isRetryAttempt: options.isRetryAttempt ?? false,
    });

    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${options.accessToken}`);
    xhr.setRequestHeader("x-upsert", String(options.upsert ?? false));

    const buildDiagnostics = (): UploadDiagnostics => ({
      requestId,
      bucket,
      storagePath: path,
      url,
      fileName,
      fileSize,
      fileType,
      uploadStartedAt: uploadStartedAtIso,
      elapsedMs: Math.round(performance.now() - uploadStartedAtMs),
      bytesSent,
      online: isDeviceOnline(),
      readyState: xhr.readyState,
      httpStatus: xhr.status,
      aborted: abortedByStall || abortedByAbsoluteTimeout || abortedByCaller,
      timedOut: abortedByStall || abortedByAbsoluteTimeout,
    });

    const stallCheckInterval = window.setInterval(() => {
      if (settled) {
        return;
      }

      const idleMs = performance.now() - lastProgressAtMs;

      if (idleMs >= STALL_TIMEOUT_MS) {
        abortedByStall = true;
        logUploadLifecycleEvent("xhr-aborted-by-stall", { requestId, idleMs, bytesSent, fileSize });
        xhr.abort();
      }
    }, 2000);

    const absoluteTimeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      abortedByAbsoluteTimeout = true;
      logUploadLifecycleEvent("xhr-aborted-by-absolute-cap", {
        requestId,
        capMs: ABSOLUTE_MAX_UPLOAD_MS,
        bytesSent,
        fileSize,
      });
      xhr.abort();
    }, ABSOLUTE_MAX_UPLOAD_MS);

    const cleanup = () => {
      settled = true;
      window.clearInterval(stallCheckInterval);
      window.clearTimeout(absoluteTimeoutId);
    };

    if (options.signal) {
      if (options.signal.aborted) {
        logUploadLifecycleEvent("xhr-not-started-signal-already-aborted", { requestId });
        cleanup();
        reject(new DOMException("Upload aborted.", "AbortError"));
        return;
      }

      options.signal.addEventListener(
        "abort",
        () => {
          logUploadLifecycleEvent("signal-abort-listener-fired", { requestId, settled, bytesSent, fileSize });

          if (settled) {
            return;
          }

          abortedByCaller = true;
          xhr.abort();
        },
        { once: true }
      );
    }

    xhr.upload.onprogress = (event) => {
      lastProgressAtMs = performance.now();
      bytesSent = event.loaded;

      // Prefer the XHR total when the browser provides it; otherwise fall back to the known
      // File/Blob size so iOS/WKWebView still shows a real bytes-sent percentage.
      const totalBytes = event.lengthComputable && event.total > 0 ? event.total : fileSize;

      if (totalBytes > 0) {
        options.onProgress?.(Math.min(99, Math.round((event.loaded / totalBytes) * 100)));
      }
    };

    xhr.onerror = () => {
      if (settled) {
        return;
      }

      cleanup();
      const diagnostics = buildDiagnostics();
      const online = diagnostics.online;
      const kind: UploadErrorKind = online ? "network" : "no-internet";
      const message = online ? "Network error during upload." : "No internet connection.";

      console.error("[post-media upload] onerror", diagnostics);

      const error = new Error(message) as StorageUploadError;
      error.errorKind = kind;
      error.diagnostics = diagnostics;
      reject(error);
    };

    xhr.onabort = () => {
      if (settled) {
        return;
      }

      cleanup();
      const diagnostics = buildDiagnostics();

      if (abortedByCaller) {
        console.log("[post-media upload] aborted by caller", diagnostics);
        const error = new DOMException("Upload aborted.", "AbortError") as unknown as StorageUploadError;
        Object.assign(error, { errorKind: "aborted" as UploadErrorKind, diagnostics });
        reject(error);
        return;
      }

      const kind: UploadErrorKind = abortedByAbsoluteTimeout ? "timeout" : "stalled";
      const message = abortedByAbsoluteTimeout
        ? "Upload timed out — this connection is too slow to finish."
        : "Upload interrupted — no data was sent for 90 seconds.";

      console.error("[post-media upload] stalled/timed out", diagnostics);

      const error = new Error(message) as StorageUploadError;
      error.errorKind = kind;
      error.diagnostics = diagnostics;
      reject(error);
    };

    xhr.onload = () => {
      if (settled) {
        return;
      }

      cleanup();
      const diagnostics = buildDiagnostics();

      if (xhr.status >= 200 && xhr.status < 300) {
        console.log("[post-media upload] success", diagnostics);
        resolve({ path });
        return;
      }

      // A retry against the same path that now gets "already exists" almost certainly means
      // the *previous* attempt actually succeeded server-side and only its response was lost
      // to the network error that triggered this retry (upsert:false makes object creation
      // idempotent). Treat it as success instead of a hard failure — this is what actually
      // prevents duplicate-upload confusion, since generating a new storage path per retry
      // would otherwise leave the orphaned first object behind and still report failure.
      if (xhr.status === 409 && options.isRetryAttempt) {
        console.log("[post-media upload] 409 on retry — object already exists from a prior attempt, treating as success", diagnostics);
        resolve({ path, alreadyExisted: true });
        return;
      }

      let message =
        xhr.status === 413
          ? "This file is too large for the server to accept."
          : `Upload failed with status ${xhr.status}.`;
      let statusCode: string | number | undefined;

      try {
        const parsed = JSON.parse(xhr.responseText) as {
          message?: string;
          error?: string;
          statusCode?: string | number;
        };
        message = parsed.message || parsed.error || message;
        statusCode = parsed.statusCode;
      } catch {
        // Non-JSON error body — keep the generic status-based message. Payload-too-large
        // responses in particular are frequently plain text (or empty) from the gateway in
        // front of Supabase Storage, not JSON, so this is the common case for 413, not the
        // exception.
      }

      console.error("[post-media upload] bad status", { ...diagnostics, responseBody: xhr.responseText?.slice(0, 500) });

      // 413 is never safe to blindly retry as-is (the same bytes will just be rejected again),
      // but callers that can shrink the file first (see lib/videoCompress.ts + the
      // "file-too-large" handling in lib/spotUploadPipeline.ts) key off this specific kind to
      // recompress harder and retry once, instead of surfacing a dead-end generic failure.
      const kind: UploadErrorKind =
        xhr.status === 401 || xhr.status === 403
          ? "auth"
          : xhr.status === 413
            ? "file-too-large"
            : xhr.status === 429 || xhr.status >= 500
              ? "http-retryable"
              : "http-permanent";

      const error = new Error(message) as StorageUploadError;
      error.errorKind = kind;
      error.diagnostics = diagnostics;

      if (statusCode !== undefined) {
        error.statusCode = statusCode;
      }

      reject(error);
    };

    xhr.send(formData);
  });
}
