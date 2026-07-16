export type GalleryAspectRatio = "square" | "portrait" | "original";

export type GalleryPhotoEffect =
  | "original"
  | "brightness"
  | "contrast"
  | "saturation"
  | "warmth"
  | "fade"
  | "blackWhite";

export type CropTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
};

export const DEFAULT_CROP_TRANSFORM: CropTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

export const GALLERY_PHOTO_EFFECTS: GalleryPhotoEffect[] = [
  "original",
  "brightness",
  "contrast",
  "saturation",
  "warmth",
  "fade",
  "blackWhite",
];

const EXPORT_MAX_EDGE = 1440;
const JPEG_QUALITY = 0.92;

export function getAspectRatioValue(
  ratio: GalleryAspectRatio,
  imageWidth: number,
  imageHeight: number
): number {
  if (ratio === "square") {
    return 1;
  }

  if (ratio === "portrait") {
    return 4 / 5;
  }

  if (imageWidth <= 0 || imageHeight <= 0) {
    return 1;
  }

  return imageWidth / imageHeight;
}

export function getRotatedImageSize(
  width: number,
  height: number,
  rotation: number
): { width: number; height: number } {
  const quarterTurns = ((rotation % 360) + 360) % 360;

  if (quarterTurns === 90 || quarterTurns === 270) {
    return { width: height, height: width };
  }

  return { width, height };
}

export function getBaseCoverScale(
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
  rotation: number
): number {
  const rotated = getRotatedImageSize(imageWidth, imageHeight, rotation);

  if (rotated.width <= 0 || rotated.height <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return 1;
  }

  return Math.max(frameWidth / rotated.width, frameHeight / rotated.height);
}

export function getEffectCssFilter(effect: GalleryPhotoEffect): string {
  switch (effect) {
    case "original":
      return "none";
    case "brightness":
      return "brightness(1.12) saturate(1.05)";
    case "contrast":
      return "contrast(1.18)";
    case "saturation":
      return "saturate(1.35)";
    case "warmth":
      return "sepia(0.22) saturate(1.15) hue-rotate(-8deg)";
    case "fade":
      return "contrast(0.88) brightness(1.08) saturate(0.82)";
    case "blackWhite":
      return "grayscale(1) contrast(1.05)";
    default:
      return "none";
  }
}

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to load image."));
      element.src = url;
    });

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getExportDimensions(aspectRatio: number): { width: number; height: number } {
  if (aspectRatio >= 1) {
    return {
      width: EXPORT_MAX_EDGE,
      height: Math.round(EXPORT_MAX_EDGE / aspectRatio),
    };
  }

  return {
    width: Math.round(EXPORT_MAX_EDGE * aspectRatio),
    height: EXPORT_MAX_EDGE,
  };
}

export async function exportEditedGalleryPhoto(input: {
  image: HTMLImageElement;
  aspectRatio: GalleryAspectRatio;
  transform: CropTransform;
  effect: GalleryPhotoEffect;
  frameWidth: number;
  frameHeight: number;
  fileName?: string;
}): Promise<File> {
  const {
    image,
    aspectRatio,
    transform,
    effect,
    frameWidth,
    frameHeight,
    fileName = "gallery-photo.jpg",
  } = input;

  const ratioValue = getAspectRatioValue(aspectRatio, image.naturalWidth, image.naturalHeight);
  const { width: exportWidth, height: exportHeight } = getExportDimensions(ratioValue);

  const scaleFactor = exportWidth / Math.max(frameWidth, 1);
  const baseScale = getBaseCoverScale(
    frameWidth,
    frameHeight,
    image.naturalWidth,
    image.naturalHeight,
    transform.rotation
  );
  const totalScale = baseScale * transform.scale;

  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = exportWidth;
  workingCanvas.height = exportHeight;

  const ctx = workingCanvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to prepare image export.");
  }

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, exportWidth, exportHeight);

  ctx.save();
  ctx.translate(
    exportWidth / 2 + transform.offsetX * scaleFactor,
    exportHeight / 2 + transform.offsetY * scaleFactor
  );
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(totalScale * scaleFactor, totalScale * scaleFactor);
  ctx.drawImage(
    image,
    -image.naturalWidth / 2,
    -image.naturalHeight / 2,
    image.naturalWidth,
    image.naturalHeight
  );
  ctx.restore();

  const filter = getEffectCssFilter(effect);

  if (filter === "none") {
    return canvasToJpegFile(workingCanvas, fileName);
  }

  const filteredCanvas = document.createElement("canvas");
  filteredCanvas.width = exportWidth;
  filteredCanvas.height = exportHeight;

  const filteredCtx = filteredCanvas.getContext("2d");

  if (!filteredCtx) {
    throw new Error("Unable to apply photo effect.");
  }

  filteredCtx.filter = filter;
  filteredCtx.drawImage(workingCanvas, 0, 0);

  return canvasToJpegFile(filteredCanvas, fileName);
}

async function canvasToJpegFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Unable to export edited photo."));
          return;
        }

        resolve(result);
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });

  return new File([blob], fileName.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export async function renderEffectPreviewDataUrl(
  sourceCanvas: HTMLCanvasElement,
  effect: GalleryPhotoEffect,
  maxEdge = 180
): Promise<string> {
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return "";
  }

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = width;
  previewCanvas.height = height;

  const ctx = previewCanvas.getContext("2d");

  if (!ctx) {
    return "";
  }

  ctx.filter = getEffectCssFilter(effect);
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  return previewCanvas.toDataURL("image/jpeg", 0.82);
}
