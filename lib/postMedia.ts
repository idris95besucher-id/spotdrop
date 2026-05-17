import {
  assertPostMediaBucket,
  logUploadError,
  NOT_SIGNED_IN_UPLOAD_MESSAGE,
  POST_MEDIA_BUCKET,
  requireAuthenticatedUser,
} from "@/lib/storageUpload";
import { supabase } from "@/lib/supabaseClient";

export { POST_MEDIA_BUCKET };

export type PostMediaType = "image" | "video";

export function getPostMediaType(file: File): PostMediaType | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
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

export async function uploadPostMedia(userId: string, file: File) {
  assertPostMediaBucket(POST_MEDIA_BUCKET);

  await requireAuthenticatedUser(userId);

  const mediaType = getPostMediaType(file);

  if (!mediaType) {
    throw new Error("Only images and videos are allowed.");
  }

  const path = formatPostMediaPath(userId, file);
  const { error: uploadError } = await supabase.storage.from(POST_MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });

  if (uploadError) {
    logUploadError(uploadError);

    if (uploadError.message.toLowerCase().includes("row-level security")) {
      throw new Error(
        "Upload was blocked. Make sure you are signed in and storage policies are configured for this bucket."
      );
    }

    throw new Error(uploadError.message || "Unable to upload media.");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(path);

  return {
    mediaUrl: publicUrl,
    mediaType,
  };
}

export { NOT_SIGNED_IN_UPLOAD_MESSAGE };
