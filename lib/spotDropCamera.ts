import { registerPlugin, Capacitor } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/capacitorUtils";

export type SpotDropCameraOpenOptions = {
  /** Hides the VIDEO/TEXT tabs and only ever captures a photo. */
  photoOnly?: boolean;
  initialMode?: "photo" | "video";
};

type SpotDropCameraOpenResult =
  | { action: "photo"; path: string; width: number; height: number; mimeType: string }
  | {
      action: "video";
      path: string;
      mimeType: string;
      durationMs: number;
      sizeBytes: number;
      width: number;
      height: number;
      isVideo: true;
    }
  | { action: "text" };

type SpotDropCameraPlugin = {
  isAvailable(): Promise<{ available: boolean; platform?: string }>;
  openCamera(options: SpotDropCameraOpenOptions): Promise<SpotDropCameraOpenResult>;
  readCapturedFile(options: { path: string }): Promise<{ base64: string; sizeBytes: number }>;
  cancel(): Promise<void>;
};

const SpotDropCameraNative = registerPlugin<SpotDropCameraPlugin>("SpotDropCamera", {
  web: () => ({
    async isAvailable() {
      return { available: false, platform: "web" };
    },
    async openCamera() {
      throw new Error("Native camera capture is only available in the SpotDrop iPhone app.");
    },
    async readCapturedFile() {
      throw new Error("Native file reading is only available in the SpotDrop iPhone app.");
    },
    async cancel() {},
  }),
});

/** True when the native SpotDropCamera plugin (photo + video) is available. */
export function isSpotDropCameraNativeAvailable() {
  return isCapacitorNative() && Capacitor.isPluginAvailable("SpotDropCamera");
}

export async function checkSpotDropCameraAvailable() {
  if (!isCapacitorNative()) {
    return false;
  }

  try {
    if (!Capacitor.isPluginAvailable("SpotDropCamera")) {
      return false;
    }

    const result = await SpotDropCameraNative.isAvailable();
    return Boolean(result.available);
  } catch {
    return false;
  }
}

/**
 * Decodes a base64 payload straight to a `File`, without going through
 * `fetch()`. `fetch(Capacitor.convertFileSrc(path))` was confirmed on-device to
 * fail with a transport-level error (status 0) for recorded video files
 * regardless of which directory they lived in, while the plugin call bridge
 * (how `base64` gets here) is a separate code path unaffected by that failure.
 * Photo capture is routed through the same mechanism for consistency — one
 * proven native return path for both, instead of two.
 */
function fileFromBase64(base64: string, mimeType: string, fileName: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType || "application/octet-stream" });
}

async function readNativeFile(path: string, mimeType: string, fileName: string): Promise<File> {
  let base64: string;
  let readSizeBytes: number;
  try {
    const read = await SpotDropCameraNative.readCapturedFile({ path });
    base64 = read.base64;
    readSizeBytes = read.sizeBytes;
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught);
    console.error(`[SpotDropCamera] readCapturedFile FAILED | path=${path} | reason=${reason}`);
    throw new Error("Unable to read the captured file.");
  }

  if (!base64 || readSizeBytes <= 0) {
    console.error(`[SpotDropCamera] readCapturedFile returned empty base64 | path=${path}`);
    throw new Error("Unable to read the captured file.");
  }

  return fileFromBase64(base64, mimeType, fileName);
}

export type SpotDropCameraOpenOutcome =
  | { kind: "photo"; file: File; width: number; height: number }
  | { kind: "video"; file: File; webPath: string; durationMs: number; width: number; height: number }
  | { kind: "text" };

/**
 * Opens the single native camera screen (AVFoundation, not getUserMedia). One
 * `AVCaptureSession` backs both PHOTO and VIDEO inside that screen — switching
 * between them there does not tear down or re-present anything on the native
 * side, and does not touch the web layer at all until the user finishes a
 * capture (or taps TEXT, or closes).
 *
 * Resolves once with the outcome: a captured photo, a captured video, or a
 * request to switch to TEXT (which has no camera concept — the caller should
 * just switch its own step/mode state). Rejects with code `USER_CANCELLED` if
 * the user closes the camera without capturing anything.
 */
export async function openSpotDropCamera(
  options: SpotDropCameraOpenOptions = {}
): Promise<SpotDropCameraOpenOutcome> {
  if (!isCapacitorNative()) {
    throw new Error("Native camera capture is only available in the SpotDrop iPhone app.");
  }

  const result = await SpotDropCameraNative.openCamera(options);

  if (result.action === "text") {
    return { kind: "text" };
  }

  if (result.action === "photo") {
    if (!result.path) {
      throw new Error("Photo could not be captured. Please try again.");
    }

    const extension = result.mimeType === "image/heic" ? "heic" : "jpg";
    const file = await readNativeFile(
      result.path,
      result.mimeType || "image/jpeg",
      `spotdrop-photo-${Date.now()}.${extension}`
    );

    return { kind: "photo", file, width: result.width, height: result.height };
  }

  // action === "video"
  if (!result.path || !result.sizeBytes || result.sizeBytes <= 0) {
    throw new Error("Video could not be recorded. Please try again.");
  }

  const webPath = Capacitor.convertFileSrc(result.path);
  const file = await readNativeFile(
    result.path,
    result.mimeType || "video/quicktime",
    `spotdrop-video-${Date.now()}.mov`
  );

  if (file.size !== result.sizeBytes) {
    console.warn(
      `[SpotDropCamera] captured video size mismatch | reported=${result.sizeBytes} | decoded=${file.size}`
    );
  }

  return {
    kind: "video",
    file,
    webPath,
    durationMs: result.durationMs,
    width: result.width,
    height: result.height,
  };
}

export async function cancelSpotDropCamera() {
  if (!isCapacitorNative() || !Capacitor.isPluginAvailable("SpotDropCamera")) {
    return;
  }

  try {
    await SpotDropCameraNative.cancel();
  } catch {
    // ignore
  }
}
