/**
 * OpenAI's /v1/chat/completions vision input (used by moderate-photo) only
 * decodes JPEG, PNG, GIF, and WEBP — not HEIC/HEIF/AVIF. iPhone gallery/camera
 * picks routinely hand back HEIC. Re-encode anything outside this allowlist to
 * a real JPEG before it's ever uploaded, so both storage and the moderation
 * endpoint always see a format OpenAI can actually decode.
 */

const JPEG_NORMALIZE_QUALITY = 0.92;

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38]; // "GIF8" (covers GIF87a/GIF89a)
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // "WEBP", at offset 8 inside a RIFF container

function bytesStartWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }

  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Sniffs the file's real magic-byte signature — never trusts the declared
 * `file.type`. Capacitor's native gallery picker (lib/pickMediaFromGallery.ts)
 * can hand back a File labeled "image/jpeg" whose actual bytes are HEIC:
 * fetching a local Capacitor webPath often yields an untyped Blob, and that
 * picker's fallback then guesses "jpeg". Trusting the label let a real HEIC
 * photo skip normalization and reach OpenAI unconverted, which OpenAI then
 * rejected with `invalid_image_format` (it decodes actual bytes, not any
 * claimed Content-Type).
 */
async function isRealSupportedVisionImage(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  if (bytesStartWith(head, JPEG_SIGNATURE)) {
    return true;
  }

  if (bytesStartWith(head, PNG_SIGNATURE)) {
    return true;
  }

  if (bytesStartWith(head, GIF_SIGNATURE)) {
    return true;
  }

  if (bytesStartWith(head, RIFF_SIGNATURE) && bytesStartWith(head, WEBP_SIGNATURE, 8)) {
    return true;
  }

  return false;
}

/** True when `file`'s actual bytes are not already a format OpenAI vision input accepts. */
export async function imageNeedsJpegNormalization(file: File): Promise<boolean> {
  return !(await isRealSupportedVisionImage(file));
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
  if (!(await imageNeedsJpegNormalization(file))) {
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
