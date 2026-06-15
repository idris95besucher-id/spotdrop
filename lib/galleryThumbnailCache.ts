const STORAGE_KEY = "spotdrop.galleryThumbnail";
const THUMBNAIL_SIZE_PX = 96;

/**
 * Web apps cannot read the device photo library without a user pick.
 * We cache a small JPEG from the last gallery selection as the preview thumbnail.
 */
export function loadGalleryThumbnail(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function fileToThumbnailDataUrl(file: File, size: number): Promise<string | null> {
  if (!file.type.startsWith("image/")) {
    return null;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

export async function saveGalleryThumbnail(file: File): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const dataUrl = await fileToThumbnailDataUrl(file, THUMBNAIL_SIZE_PX);

  if (!dataUrl) {
    return null;
  }

  try {
    localStorage.setItem(STORAGE_KEY, dataUrl);
  } catch {
    return dataUrl;
  }

  return dataUrl;
}
