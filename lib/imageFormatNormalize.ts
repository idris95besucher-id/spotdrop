/**
 * OpenAI's /v1/chat/completions vision input (used by moderate-photo) only
 * decodes JPEG, PNG, GIF, and WEBP — not HEIC/HEIF/AVIF. iPhone gallery/camera
 * picks routinely hand back HEIC. Re-encode anything outside this allowlist to
 * a real JPEG before it's ever uploaded, so both storage and the moderation
 * endpoint always see a format OpenAI can actually decode.
 */
const SUPPORTED_VISION_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const JPEG_NORMALIZE_QUALITY = 0.92;

/** True when `file` is not already a format OpenAI vision input accepts. */
export function imageNeedsJpegNormalization(file: File): boolean {
  return !SUPPORTED_VISION_IMAGE_MIME_TYPES.has(file.type.toLowerCase());
}

function jpegFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, "").trim();
  return `${base || "photo"}.jpg`;
}

/**
 * Re-encodes `file` as a real JPEG — actual re-encoded bytes, never a
 * renamed/retyped file. Already-supported formats are returned unchanged.
 *
 * Decoding goes through an <img> element (same primitive as
 * lib/profileGalleryPhotoEditor.ts's loadImageFromFile), so the browser
 * applies EXIF orientation before the pixels ever reach the canvas — the
 * output JPEG has correct orientation baked into its pixels and needs no
 * orientation tag of its own, so an iPhone portrait photo is never
 * accidentally rotated.
 */
export async function normalizeImageForPublish(
  file: File,
  quality: number = JPEG_NORMALIZE_QUALITY
): Promise<File> {
  if (!imageNeedsJpegNormalization(file)) {
    return file;
  }

  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to decode image for format conversion."));
      element.src = url;
    });

    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error("Decoded image has no dimensions.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas 2D context unavailable for image format conversion.");
    }

    ctx.drawImage(image, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("Unable to encode converted image."));
            return;
          }
          resolve(result);
        },
        "image/jpeg",
        quality
      );
    });

    // Defensive: confirm the browser actually produced JPEG bytes rather than
    // silently falling back to some other encoding — cheap insurance against
    // an unsupported file quietly reaching moderate-photo unconverted.
    if (blob.type !== "image/jpeg" || blob.size <= 0) {
      throw new Error(
        `Image format conversion produced unexpected output (type=${blob.type}, size=${blob.size}).`
      );
    }

    return new File([blob], jpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
