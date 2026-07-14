import {
  assertPostMediaBucket,
  logUploadError,
  NOT_SIGNED_IN_UPLOAD_MESSAGE,
  POST_MEDIA_BUCKET,
  requireAuthenticatedUser,
  uploadFileToStorageWithProgress,
} from "@/lib/storageUpload";
import { supabase } from "@/lib/supabaseClient";

export type UploadProgressCallback = (percent: number) => void;

type UploadPostMediaOptions = {
  onProgress?: UploadProgressCallback;
  /** Pass from publish pipeline to skip a second auth round-trip. */
  accessToken?: string;
  /** Skip slow post-upload HEAD/list verification (default: true). */
  skipVerification?: boolean;
};

export { POST_MEDIA_BUCKET };

export type PostMediaType = "image" | "video";

export type UploadPostMediaResult = {
  mediaUrl: string;
  mediaType: PostMediaType;
  storagePath: string;
};

export function getPostMediaType(file: File): PostMediaType | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(file.name)) {
    return /\.(mp4|mov|m4v)(\?|#|$)/i.test(file.name) ? "video" : "video";
  }

  if (/\.(jpe?g|png|gif|webp|heic|heif|avif)(\?|#|$)/i.test(file.name)) {
    return "image";
  }

  return null;
}

export function formatPostMediaPath(userId: string, file: File) {
  const mediaType = getPostMediaType(file);
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "bin";
  const prefix = mediaType === "video" ? "video" : "image";

  return `${userId}/${prefix}-${Date.now()}.${safeExtension}`;
}

async function verifyStorageBucket(bucket: string) {
  const { data, error } = await supabase.storage.listBuckets();

  const exists = Boolean(data?.some((entry) => entry.name === bucket || entry.id === bucket));

  console.log("STORAGE BUCKET CHECK", {
    bucket,
    exists,
    buckets: data?.map((entry) => entry.name) ?? null,
    error,
  });

  return exists;
}

async function verifyStorageObjectExists(bucket: string, storagePath: string) {
  const folder = storagePath.includes("/") ? storagePath.slice(0, storagePath.lastIndexOf("/")) : "";
  const filename = storagePath.includes("/") ? storagePath.slice(storagePath.lastIndexOf("/") + 1) : storagePath;

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 100,
    search: filename,
  });

  const exists = Boolean(data?.some((entry) => entry.name === filename));

  console.log("STORAGE OBJECT CHECK", {
    bucket,
    storage_path: storagePath,
    exists,
    listed: data?.map((entry) => entry.name) ?? null,
    error,
  });

  return exists;
}

async function verifyPublicMediaUrl(publicUrl: string, storagePath: string) {
  try {
    const response = await fetch(publicUrl, { method: "HEAD" });

    console.log("PUBLIC URL RESULT", {
      storage_path: storagePath,
      publicUrl,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      phase: "head",
    });

    return response.ok;
  } catch (error) {
    console.log("PUBLIC URL RESULT", {
      storage_path: storagePath,
      publicUrl,
      ok: false,
      phase: "head",
      error,
    });

    return false;
  }
}

export async function uploadPostMedia(
  userId: string,
  file: File,
  options: UploadPostMediaOptions = {}
): Promise<UploadPostMediaResult> {
  assertPostMediaBucket(POST_MEDIA_BUCKET);

  if (!options.accessToken) {
    await requireAuthenticatedUser(userId);
  }

  const mediaType = getPostMediaType(file);

  if (!mediaType) {
    throw new Error("Only images and videos are allowed.");
  }

  const storagePath = formatPostMediaPath(userId, file);
  const skipVerification = options.skipVerification !== false;

  if (!skipVerification) {
    await verifyStorageBucket(POST_MEDIA_BUCKET);
  }

  // Storage upload starts immediately — no SHA-256 hashing, no MP4 box
  // parsing, no metadata probe before this. Those were leftover corruption
  // diagnostics from an earlier, now-fixed bug; they read the *entire* file
  // into memory and hashed it (twice, once here and once again in
  // prepareMediaFileForPublish) before any network request began, which was
  // the dominant reason "Uploading video..." sat there for a long time.
  options.onProgress?.(0);

  const uploadStartedAt = performance.now();
  let uploadError: (Error & { statusCode?: string | number }) | null = null;

  try {
    // Real XHR upload (not supabase-js's fetch-based `.upload()`) so
    // `onProgress` reports actual bytes sent, not a simulated 0-then-100 —
    // and so the original File is streamed directly, never re-buffered or
    // re-encoded for the upload itself.
    await uploadFileToStorageWithProgress(POST_MEDIA_BUCKET, storagePath, file, {
      accessToken: options.accessToken,
      cacheControl: "3600",
      upsert: false,
      onProgress: options.onProgress,
    });
  } catch (caught) {
    uploadError = caught as Error & { statusCode?: string | number };
  }

  const uploadElapsedMs = Math.round(performance.now() - uploadStartedAt);

  console.log("UPLOAD FILE RESULT", {
    bucket: POST_MEDIA_BUCKET,
    storage_path: storagePath,
    fileName: file.name,
    fileSize: file.size,
    fileSizeMb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
    fileType: file.type,
    uploadElapsedMs,
    error: uploadError?.message ?? null,
  });

  if (uploadError) {
    logUploadError(uploadError);
    console.error("[SPOT PUBLISH] step=upload_storage", {
      bucket: POST_MEDIA_BUCKET,
      storage_path: storagePath,
      message: uploadError.message,
      statusCode: uploadError.statusCode,
    });

    if (uploadError.message.toLowerCase().includes("row-level security")) {
      throw new Error(
        `[SPOT PUBLISH] step=upload_storage | ${uploadError.message} | Upload was blocked by storage RLS. Make sure you are signed in and storage policies allow uploads to ${POST_MEDIA_BUCKET}.`
      );
    }

    throw new Error(
      `[SPOT PUBLISH] step=upload_storage | ${uploadError.message}${
        uploadError.statusCode != null ? ` | status=${uploadError.statusCode}` : ""
      }`
    );
  }

  options.onProgress?.(100);

  const {
    data: { publicUrl },
  } = supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(storagePath);

  if (!skipVerification) {
    const publicUrlOk = await verifyPublicMediaUrl(publicUrl, storagePath);
    const objectExists = await verifyStorageObjectExists(POST_MEDIA_BUCKET, storagePath);

    console.log("PUBLIC URL RESULT", {
      storage_path: storagePath,
      publicUrl,
      headOk: publicUrlOk,
      objectExists,
    });

    if (!objectExists) {
      throw new Error(`Uploaded file missing from bucket at ${storagePath}`);
    }

    if (!publicUrlOk) {
      console.warn("PUBLIC URL RESULT: HEAD check failed but object exists in bucket", {
        storage_path: storagePath,
        publicUrl,
      });
    }
  }

  return {
    mediaUrl: publicUrl,
    mediaType,
    storagePath,
  };
}

export { NOT_SIGNED_IN_UPLOAD_MESSAGE };
