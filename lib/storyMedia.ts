import {
  assertPostMediaBucket,
  logUploadError,
  NOT_SIGNED_IN_UPLOAD_MESSAGE,
  POST_MEDIA_BUCKET,
  requireAuthenticatedUser,
} from "@/lib/storageUpload";
import { supabase } from "@/lib/supabaseClient";

export const STORY_MAX_VIDEO_SECONDS = 60;

export type StoryMediaType = "image" | "video";

export function getStoryMediaType(file: File): StoryMediaType | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  return null;
}

export function formatStoryMediaPath(userId: string, file: File) {
  const mediaType = getStoryMediaType(file);
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "bin";
  const prefix = mediaType === "video" ? "story-video" : "story-image";

  return `${userId}/${prefix}-${Date.now()}.${safeExtension}`;
}

export async function readVideoDurationSeconds(file: File): Promise<number | null> {
  if (!file.type.startsWith("video/")) {
    return null;
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    video.src = url;
  });
}

export async function uploadStoryMedia(userId: string, file: File) {
  assertPostMediaBucket(POST_MEDIA_BUCKET);
  await requireAuthenticatedUser(userId);

  const mediaType = getStoryMediaType(file);

  if (!mediaType) {
    throw new Error("Stories support photos and short videos only.");
  }

  if (mediaType === "video") {
    const duration = await readVideoDurationSeconds(file);

    if (duration !== null && duration > STORY_MAX_VIDEO_SECONDS) {
      throw new Error(`Story videos must be ${STORY_MAX_VIDEO_SECONDS} seconds or less.`);
    }
  }

  const path = formatStoryMediaPath(userId, file);
  const { error: uploadError } = await supabase.storage.from(POST_MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });

  if (uploadError) {
    logUploadError(uploadError);
    throw new Error(uploadError.message || "Unable to upload story media.");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(path);

  return { mediaUrl: publicUrl, mediaType };
}

export { NOT_SIGNED_IN_UPLOAD_MESSAGE };
