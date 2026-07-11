import { Capacitor } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/capacitorUtils";

/** Gallery picker accept for Story and Add Spot library uploads. */
export const GALLERY_MEDIA_ACCEPT = "image/*,video/*";

export const GALLERY_IMAGE_ACCEPT = "image/*";

export function isIOSDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  const classicIOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return classicIOS || iPadOS;
}

export function applyGalleryFileInputAttributes(
  input: HTMLInputElement,
  accept: string = GALLERY_MEDIA_ACCEPT
) {
  input.type = "file";
  input.accept = accept;
  input.multiple = false;
  // Never add capture here. iOS will show Take Photo or Video / Choose File.
  input.removeAttribute("capture");
  input.removeAttribute("webkitcapture");
}

type PickMediaOptions = {
  accept?: string;
};

type SpotGalleryMediaKind = "image" | "video";

function isGalleryPickCancelled(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: string }).code ?? "") : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    code === "OS-PLUG-CAMR-0020" ||
    message.includes("cancel") ||
    message.includes("canceled") ||
    message.includes("cancelled")
  );
}

function extensionForGalleryMedia(kind: SpotGalleryMediaKind, format?: string | null) {
  const normalized = format?.toLowerCase() ?? "";

  if (kind === "video") {
    if (normalized.includes("mov")) {
      return "mov";
    }

    return "mp4";
  }

  if (normalized.includes("png")) {
    return "png";
  }

  if (normalized.includes("heic") || normalized.includes("heif")) {
    return "heic";
  }

  if (normalized.includes("gif")) {
    return "gif";
  }

  return "jpg";
}

function mimeForGalleryMedia(kind: SpotGalleryMediaKind, extension: string) {
  if (kind === "video") {
    return extension === "mov" ? "video/quicktime" : "video/mp4";
  }

  switch (extension) {
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

function isVideoGalleryFile(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(file.name);
}

async function fetchBlobFromPath(sourcePath: string): Promise<Blob | null> {
  try {
    const response = await fetch(sourcePath);

    if (response.ok) {
      const blob = await response.blob();

      if (blob.size > 0) {
        return blob;
      }
    }
  } catch {
    // Fall through to XHR — Capacitor file URLs can fail with fetch on iOS.
  }

  if (typeof XMLHttpRequest === "undefined") {
    return null;
  }

  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", sourcePath);
      xhr.responseType = "blob";
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 0) {
          resolve(xhr.response as Blob);
          return;
        }

        reject(new Error(`XHR status ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("XHR network error"));
      xhr.send();
    });

    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function mediaResultToFile(
  item: {
    webPath?: string;
    uri?: string;
    metadata?: { format?: string };
    type?: number;
  },
  kind: SpotGalleryMediaKind
): Promise<File | null> {
  const candidatePaths = [
    item.webPath,
    item.uri ? Capacitor.convertFileSrc(item.uri) : null,
    item.uri ?? null,
  ].filter((path, index, paths): path is string => Boolean(path) && paths.indexOf(path) === index);

  for (const sourcePath of candidatePaths) {
    const blob = await fetchBlobFromPath(sourcePath);

    if (!blob) {
      continue;
    }

    const extension = extensionForGalleryMedia(kind, item.metadata?.format ?? blob.type);
    const mime = blob.type || mimeForGalleryMedia(kind, extension);
    const name = `spot-gallery-${Date.now()}.${extension}`;

    return new File([blob], name, { type: mime });
  }

  console.warn("[Spot media] gallery file conversion failed", {
    kind,
    hasWebPath: Boolean(item.webPath),
    hasUri: Boolean(item.uri),
    mediaType: item.type,
  });

  return null;
}

async function pickFromNativePhotoLibrary(kind: SpotGalleryMediaKind): Promise<File | null> {
  const { Camera, CameraErrorCode, MediaType, MediaTypeSelection } = await import("@capacitor/camera");

  const permission = await Camera.checkPermissions();

  if (permission.photos !== "granted" && permission.photos !== "limited") {
    const requested = await Camera.requestPermissions({ permissions: ["photos"] });

    if (requested.photos !== "granted" && requested.photos !== "limited") {
      return null;
    }
  }

  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: kind === "image" ? MediaTypeSelection.Photo : MediaTypeSelection.Video,
      allowMultipleSelection: false,
      editable: "no",
      includeMetadata: true,
    });

    const item = results[0];

    if (!item) {
      return null;
    }

    if (kind === "video" && item.type !== MediaType.Video) {
      console.warn("[Spot media] expected video from gallery picker", { type: item.type });
    }

    return mediaResultToFile(item, kind);
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code ?? "")
        : "";

    if (isGalleryPickCancelled(error) || errorCode === CameraErrorCode.ChooseMediaCancelled) {
      return null;
    }

    throw error;
  }
}

/** Programmatic gallery pick (avatar, etc.) — not used on Spot camera. */
export function pickMediaFromGallery(options: PickMediaOptions = {}): Promise<File | null> {
  const accept = options.accept ?? GALLERY_MEDIA_ACCEPT;

  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    applyGalleryFileInputAttributes(input, accept);
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.className = "sr-only";

    let settled = false;

    const finish = (file: File | null) => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("focus", handleCancel);
      input.remove();
      resolve(file);
    };

    const handleCancel = () => {
      window.setTimeout(() => {
        if (!settled && !input.files?.length) {
          finish(null);
        }
      }, 500);
    };

    input.addEventListener(
      "change",
      () => {
        finish(input.files?.[0] ?? null);
      },
      { once: true }
    );

    document.body.appendChild(input);
    window.addEventListener("focus", handleCancel, { once: true });

    window.requestAnimationFrame(() => {
      input.click();
    });
  });
}

export function pickImageFromGallery(): Promise<File | null> {
  return pickMediaFromGallery({ accept: GALLERY_IMAGE_ACCEPT });
}

/** Spot compose: native Photos picker on device, filtered to images only. */
export async function pickSpotGalleryPhoto(): Promise<File | null> {
  if (isCapacitorNative()) {
    return pickFromNativePhotoLibrary("image");
  }

  return pickMediaFromGallery({ accept: GALLERY_IMAGE_ACCEPT });
}

/** Spot compose: native Photos picker on device, filtered to videos only. */
export async function pickSpotGalleryVideo(): Promise<File | null> {
  if (isCapacitorNative()) {
    const file = await pickFromNativePhotoLibrary("video");

    if (!file) {
      return null;
    }

    if (isVideoGalleryFile(file)) {
      return file;
    }

    console.warn("[Spot media] rejected native gallery video file", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    return null;
  }

  const file = await pickMediaFromGallery({ accept: "video/*" });

  if (!file || !isVideoGalleryFile(file)) {
    return null;
  }

  return file;
}
