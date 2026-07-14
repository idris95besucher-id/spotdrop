import type { StorageError } from "@supabase/storage-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/lib/supabaseClient";

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

export type StorageUploadProgressCallback = (percent: number) => void;

export type RawStorageUploadResult = {
  path: string;
};

/**
 * Uploads a File/Blob straight to Supabase Storage's REST endpoint via
 * `XMLHttpRequest`, instead of going through `supabase-js`'s `.upload()`.
 *
 * Why: `supabase-js` sends the request with `fetch()`, and `fetch()` has no
 * cross-platform way to observe upload (request body) progress — only
 * download progress. That's why the app could previously only ever report
 * "0%" then "100%" once the whole transfer had already finished, regardless
 * of file size. `XMLHttpRequest.upload.onprogress` *does* fire incrementally
 * as bytes leave the device, giving real byte-level progress.
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
  } = {}
): Promise<RawStorageUploadResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Missing Supabase configuration for storage upload."));
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

  return new Promise<RawStorageUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${options.accessToken || SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("x-upsert", String(options.upsert ?? false));

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Upload aborted.", "AbortError"));
        return;
      }

      options.signal.addEventListener(
        "abort",
        () => {
          xhr.abort();
        },
        { once: true }
      );
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload."));
    };

    xhr.onabort = () => {
      reject(new DOMException("Upload aborted.", "AbortError"));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ path });
        return;
      }

      let message = `Upload failed with status ${xhr.status}.`;
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
        // Non-JSON error body — keep the generic status-based message.
      }

      const error = new Error(message) as Error & { statusCode?: string | number };

      if (statusCode !== undefined) {
        error.statusCode = statusCode;
      }

      reject(error);
    };

    xhr.send(formData);
  });
}
