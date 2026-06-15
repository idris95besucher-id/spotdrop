import { uploadPostMedia } from "@/lib/postMedia";

/** Upload a chat photo to shared post-media storage. */
export async function uploadCityRoomChatImage(userId: string, file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  const { mediaUrl } = await uploadPostMedia(userId, file);
  return mediaUrl;
}
