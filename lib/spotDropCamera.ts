import { registerPlugin, Capacitor } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import { createStageTimer, logSpotVideoUploadDiagnostics } from "@/lib/spotVideoUploadTiming";

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

type NativeVideoUploadResult = {
  objectPath: string;
  coverObjectPath?: string | null;
  originalSizeBytes: number;
  finalSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  bitrateMbps: number;
  compressed: boolean;
  uploadSpeedMbps: number;
  httpStatus: number;
  timing: {
    probeMs: number;
    compressMs: number;
    coverMs: number;
    uploadMs: number;
    serverWaitMs: number;
    totalMs: number;
  };
};

type SpotDropCameraPlugin = {
  isAvailable(): Promise<{ available: boolean; platform?: string }>;
  openCamera(options: SpotDropCameraOpenOptions): Promise<SpotDropCameraOpenResult>;
  readCapturedFile(options: { path: string }): Promise<{ base64: string; sizeBytes: number }>;
  uploadVideoToStorage(options: {
    path: string;
    supabaseUrl: string;
    bucket: string;
    objectPath: string;
    coverObjectPath?: string;
    accessToken: string;
    apikey: string;
  }): Promise<NativeVideoUploadResult>;
  cancel(): Promise<void>;
  addListener?(
    eventName: "nativeVideoUploadProgress",
    listener: (event: { percent: number; objectPath: string }) => void
  ): Promise<{ remove: () => void }>;
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
    async uploadVideoToStorage() {
      throw new Error("Native video upload is only available in the SpotDrop iPhone app.");
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
 * Decodes a base64 payload straight to a `File`. Used for **photos only**.
 * Spot videos must never use this path — see `openSpotDropCamera` / `uploadNativeSpotVideo`.
 */
function fileFromBase64(base64: string, mimeType: string, fileName: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType || "application/octet-stream" });
}

async function readNativePhotoFile(path: string, mimeType: string, fileName: string): Promise<File> {
  const bridgeStarted = performance.now();
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

  const bridgeMs = Math.round(performance.now() - bridgeStarted);
  console.log("[SPOT-VIDEO-TIMING] photo base64 bridge (videos must not use this)", {
    sizeBytes: readSizeBytes,
    bridgeMs,
  });

  if (!base64 || readSizeBytes <= 0) {
    throw new Error("Unable to read the captured file.");
  }

  return fileFromBase64(base64, mimeType, fileName);
}

export type SpotDropCameraOpenOutcome =
  | { kind: "photo"; file: File; width: number; height: number }
  | {
      kind: "video";
      /** Empty stub — video bytes stay on disk at `nativePath`. Never base64-decoded. */
      file: File;
      webPath: string;
      nativePath: string;
      sizeBytes: number;
      durationMs: number;
      width: number;
      height: number;
    }
  | { kind: "text" };

/**
 * Opens the single native camera screen (AVFoundation, not getUserMedia).
 *
 * Video: returns the filesystem path + streaming webPath only. Does **not** read
 * the video into JS memory / base64 — that was the measured bottleneck.
 */
export async function openSpotDropCamera(
  options: SpotDropCameraOpenOptions = {}
): Promise<SpotDropCameraOpenOutcome> {
  if (!isCapacitorNative()) {
    throw new Error("Native camera capture is only available in the SpotDrop iPhone app.");
  }

  const timer = createStageTimer();
  timer.mark("open");
  const result = await SpotDropCameraNative.openCamera(options);

  if (result.action === "text") {
    return { kind: "text" };
  }

  if (result.action === "photo") {
    if (!result.path) {
      throw new Error("Photo could not be captured. Please try again.");
    }

    const extension = result.mimeType === "image/heic" ? "heic" : "jpg";
    const file = await readNativePhotoFile(
      result.path,
      result.mimeType || "image/jpeg",
      `spotdrop-photo-${Date.now()}.${extension}`
    );

    return { kind: "photo", file, width: result.width, height: result.height };
  }

  // action === "video" — keep bytes on disk; never base64 / FileReader / ArrayBuffer.
  if (!result.path || !result.sizeBytes || result.sizeBytes <= 0) {
    throw new Error("Video could not be recorded. Please try again.");
  }

  const webPath = Capacitor.convertFileSrc(result.path);
  const stubFile = new File([], `spotdrop-video-${Date.now()}.mov`, {
    type: result.mimeType || "video/quicktime",
  });

  console.log("[SPOT-VIDEO-TIMING] capture complete — video left on disk (no JS memory load)", {
    path: result.path,
    originalSizeBytes: result.sizeBytes,
    originalSizeMb: Math.round((result.sizeBytes / (1024 * 1024)) * 100) / 100,
    durationSeconds: result.durationMs / 1000,
    resolution: `${result.width}x${result.height}`,
    bridgeMs: timer.msSince("open"),
    readIntoMemoryMs: 0,
  });

  return {
    kind: "video",
    file: stubFile,
    webPath,
    nativePath: result.path,
    sizeBytes: result.sizeBytes,
    durationMs: result.durationMs,
    width: result.width,
    height: result.height,
  };
}

export type NativeSpotVideoUploadInput = {
  nativePath: string;
  userId: string;
  accessToken: string;
  apikey: string;
  supabaseUrl: string;
  bucket: string;
  onProgress?: (percent: number) => void;
};

export type NativeSpotVideoUploadOutcome = {
  mediaUrl: string;
  coverMediaUrl: string | null;
  storagePath: string;
  coverStoragePath: string | null;
  diagnostics: ReturnType<typeof buildNativeDiagnostics>;
};

function buildNativeDiagnostics(result: NativeVideoUploadResult, exactError: string | null) {
  return {
    originalSizeBytes: result.originalSizeBytes,
    finalSizeBytes: result.finalSizeBytes,
    durationSeconds: result.durationSeconds,
    width: result.width,
    height: result.height,
    bitrateMbps: result.bitrateMbps,
    uploadSpeedMbps: result.uploadSpeedMbps,
    stagesMs: {
      prepare: result.timing.probeMs,
      compress: result.timing.compressMs,
      read_into_memory: 0,
      upload_start: 0,
      upload: result.timing.uploadMs,
      server_response: result.timing.serverWaitMs,
      total: result.timing.totalMs,
    },
    exactError,
    path: "native-disk" as const,
  };
}

/**
 * Uploads a Spot video from the native filesystem path via URLSession.
 * Compresses once on-device if needed (1080p / ≤15s / under 30 MB). No auto-retries.
 */
export async function uploadNativeSpotVideo(
  input: NativeSpotVideoUploadInput
): Promise<NativeSpotVideoUploadOutcome> {
  const objectPath = `${input.userId}/video-${Date.now()}.mp4`;
  const coverObjectPath = `${input.userId}/image-${Date.now()}.jpg`;

  console.log("[SPOT-VIDEO-TIMING] upload_start (native URLSession from disk)", {
    nativePath: input.nativePath,
    objectPath,
    coverObjectPath,
  });

  let progressHandle: { remove: () => void } | null = null;

  try {
    if (typeof SpotDropCameraNative.addListener === "function") {
      progressHandle = await SpotDropCameraNative.addListener(
        "nativeVideoUploadProgress",
        (event) => {
          if (event.objectPath === objectPath) {
            input.onProgress?.(event.percent);
          }
        }
      );
    }

    const result = await SpotDropCameraNative.uploadVideoToStorage({
      path: input.nativePath,
      supabaseUrl: input.supabaseUrl,
      bucket: input.bucket,
      objectPath,
      coverObjectPath,
      accessToken: input.accessToken,
      apikey: input.apikey,
    });

    const diagnostics = buildNativeDiagnostics(result, null);
    logSpotVideoUploadDiagnostics("native upload succeeded", diagnostics);

    const base = input.supabaseUrl.replace(/\/$/, "");
    const mediaUrl = `${base}/storage/v1/object/public/${input.bucket}/${result.objectPath}`;
    const coverMediaUrl = result.coverObjectPath
      ? `${base}/storage/v1/object/public/${input.bucket}/${result.coverObjectPath}`
      : null;

    input.onProgress?.(100);

    return {
      mediaUrl,
      coverMediaUrl,
      storagePath: result.objectPath,
      coverStoragePath: result.coverObjectPath ?? null,
      diagnostics,
    };
  } catch (caught) {
    const exactError = caught instanceof Error ? caught.message : String(caught);
    console.error("[SPOT-VIDEO-TIMING] native upload exact error", { exactError, caught });
    logSpotVideoUploadDiagnostics("native upload failed", {
      originalSizeBytes: 0,
      finalSizeBytes: 0,
      durationSeconds: 0,
      width: 0,
      height: 0,
      bitrateMbps: 0,
      uploadSpeedMbps: 0,
      stagesMs: {},
      exactError,
      path: "native-disk",
    });
    throw caught instanceof Error ? caught : new Error(exactError);
  } finally {
    progressHandle?.remove();
  }
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
