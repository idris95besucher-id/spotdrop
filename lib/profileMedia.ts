import {
  assertAvatarsBucket,
  AVATARS_BUCKET,
  logUploadError,
  NOT_SIGNED_IN_UPLOAD_MESSAGE,
  requireAuthenticatedUser,
} from "@/lib/storageUpload";
import { supabase } from "@/lib/supabaseClient";

function formatAvatarPath(userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
  return `${userId}/avatar-${Date.now()}.${safeExtension}`;
}

/** Upload a profile photo to the `avatars` bucket. */
export async function uploadAvatarImage(userId: string, file: File) {
  assertAvatarsBucket(AVATARS_BUCKET);

  await requireAuthenticatedUser(userId);

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  const path = formatAvatarPath(userId, file);
  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });

  if (uploadError) {
    logUploadError(uploadError);

    if (uploadError.message.toLowerCase().includes("row-level security")) {
      throw new Error(
        "Upload was blocked. Make sure you are signed in and storage policies are configured for this bucket."
      );
    }

    throw new Error(uploadError.message || "Unable to upload profile photo.");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);

  return publicUrl;
}

/** @deprecated Use uploadAvatarImage */
export const uploadProfileImage = uploadAvatarImage;

export { NOT_SIGNED_IN_UPLOAD_MESSAGE };
