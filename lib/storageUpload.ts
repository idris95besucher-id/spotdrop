import type { StorageError } from "@supabase/storage-js";
import { supabase } from "@/lib/supabaseClient";

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
