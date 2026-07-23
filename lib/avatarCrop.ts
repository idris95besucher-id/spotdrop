import {
  DEFAULT_CROP_TRANSFORM,
  type CropTransform,
  exportEditedGalleryPhoto,
  getBaseCoverScale,
  loadImageFromFile,
} from "@/lib/profileGalleryPhotoEditor";

/** Square avatar edge length in pixels after crop/export. */
export const AVATAR_EXPORT_SIZE = 1024;
const AVATAR_JPEG_QUALITY = 0.88;

export { DEFAULT_CROP_TRANSFORM, loadImageFromFile, getBaseCoverScale };
export type { CropTransform };

/**
 * Export the circular-preview crop as a square JPEG.
 * The circle is a UI mask only — storage/display use a square with object-fit: cover.
 */
export async function exportCroppedAvatar(input: {
  image: HTMLImageElement;
  transform: CropTransform;
  frameSize: number;
  fileName?: string;
}): Promise<File> {
  const { image, transform, frameSize, fileName = "avatar.jpg" } = input;
  const size = Math.max(1, Math.round(frameSize));

  // Reuse the gallery square exporter, then downscale to a consistent avatar size.
  const squareFile = await exportEditedGalleryPhoto({
    image,
    aspectRatio: "square",
    transform,
    effect: "original",
    frameWidth: size,
    frameHeight: size,
    fileName,
  });

  return downscaleAvatarJpeg(squareFile, AVATAR_EXPORT_SIZE, AVATAR_JPEG_QUALITY);
}

async function downscaleAvatarJpeg(file: File, maxEdge: number, quality: number): Promise<File> {
  const image = await loadImageFromFile(file);
  const sourceEdge = Math.max(image.naturalWidth, image.naturalHeight);

  if (sourceEdge <= maxEdge) {
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = maxEdge;
  canvas.height = maxEdge;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return file;
  }

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, maxEdge, maxEdge);
  ctx.drawImage(image, 0, 0, maxEdge, maxEdge);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Unable to compress avatar."));
          return;
        }

        resolve(result);
      },
      "image/jpeg",
      quality
    );
  });

  return new File([blob], "avatar.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
