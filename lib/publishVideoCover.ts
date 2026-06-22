import { uploadPostMedia, type UploadProgressCallback } from "@/lib/postMedia";
import { resolveVideoCoverFile } from "@/lib/videoCover";

type UploadVideoCoverOptions = {
  accessToken?: string;
  onProgress?: UploadProgressCallback;
};

export async function uploadVideoCoverForPublish(
  userId: string,
  videoSource: File | string,
  pickedCover: File | null | undefined,
  options: UploadVideoCoverOptions = {}
) {
  if (pickedCover) {
    const upload = await uploadPostMedia(userId, pickedCover, {
      accessToken: options.accessToken,
      onProgress: options.onProgress,
    });

    return upload.mediaUrl;
  }

  const coverFile = await resolveVideoCoverFile(videoSource, null, 1);
  const upload = await uploadPostMedia(userId, coverFile, {
    accessToken: options.accessToken,
    onProgress: options.onProgress,
  });

  return upload.mediaUrl;
}
