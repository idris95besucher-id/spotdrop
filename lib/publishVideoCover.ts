import { uploadPostMedia } from "@/lib/postMedia";
import { resolveVideoCoverFile } from "@/lib/videoCover";

export async function uploadVideoCoverForPublish(
  userId: string,
  videoSource: File | string,
  pickedCover?: File | null
) {
  const coverFile = await resolveVideoCoverFile(videoSource, pickedCover ?? null, 1);
  const upload = await uploadPostMedia(userId, coverFile);

  return upload.mediaUrl;
}
