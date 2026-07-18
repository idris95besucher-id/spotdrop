import { isIosSafari } from "@/lib/cameraCapture";
import { isCapacitorNative } from "@/lib/capacitorUtils";

/**
 * Already small enough — compressing would only cost quality/time for no real benefit. Sized
 * above what a max-length (15s), native-bitrate 1080p Spot clip produces, so normal camera
 * clips skip straight to upload; oversized gallery-picked footage still gets compressed.
 */
export const VIDEO_COMPRESS_SKIP_BELOW_BYTES = 20 * 1024 * 1024;

type CompressPass = { maxLongSidePx: number; videoBitsPerSecond: number };

/**
 * Resolution is capped at 1080p — Spot videos keep their original HD quality. `1920` is a
 * ceiling, not a target: a source already at or below it is left at its native size.
 * Compression runs at most once per publish (never again on upload retry).
 */
const SPOT_VIDEO_MAX_LONG_SIDE_PX = 1920;

/** Single 1080p encode pass — bitrate optimized for a fast 15s upload without soft resolution. */
const PASS_1080P_ONCE: CompressPass = {
  maxLongSidePx: SPOT_VIDEO_MAX_LONG_SIDE_PX,
  videoBitsPerSecond: 6_000_000,
};

function isSafariFamilyRecorder() {
  return isIosSafari() || isCapacitorNative();
}

/** Feature detection only — never user-agent sniffing for capability. */
export function isVideoCompressionSupported(): boolean {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    return false;
  }

  const canvas = document.createElement("canvas");
  return typeof (canvas as HTMLCanvasElement & { captureStream?: unknown }).captureStream === "function";
}

function waitForEvent<K extends keyof HTMLVideoElementEventMap>(
  video: HTMLVideoElement,
  event: K,
  errorMessage: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
      reject(new Error(errorMessage));
    };

    video.addEventListener(event, onEvent);
    video.addEventListener("error", onError);
  });
}

/**
 * Picks a webm codec MediaRecorder actually supports on this browser. Chrome/Firefox only —
 * never used on the Safari-family branch, which must be constructed with no options at all
 * (see compressVideoFile below).
 */
function pickWebmMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "";
}

type CompressVideoFileOptions = CompressPass & {
  onProgress?: (percent: number) => void;
};

/**
 * Re-encodes a video file by playing it into a hidden <video>, drawing each frame onto a
 * <canvas> sized to the target resolution, and recording the canvas (+ a Web Audio-routed copy
 * of the original audio track) with MediaRecorder.
 *
 * Why a canvas instead of `video.captureStream()`: Safari/WebKit (desktop and iOS) has never
 * implemented `HTMLVideoElement.captureStream()`, which is what the desktop-only re-encode path
 * in lib/videoExport.ts relies on — that's why it's gated off entirely on iOS/Capacitor. WebKit
 * *has* supported `HTMLCanvasElement.captureStream()` since Safari 11, so drawing frames onto a
 * canvas and capturing *that* works everywhere, including inside Capacitor's iOS WKWebView —
 * which is exactly the platform that most needs this, since it can't fall back to a native
 * captureStream export at all today.
 *
 * Audio likewise can't use `captureStream()` on a media element on Safari; instead it's routed
 * through the Web Audio API (`createMediaElementSource` -> `createMediaStreamDestination`),
 * which Safari has always supported independently of the captureStream limitation.
 */
async function compressVideoFile(file: File, options: CompressVideoFileOptions): Promise<File> {
  if (!isVideoCompressionSupported()) {
    throw new Error("Video compression is not supported in this browser.");
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  let audioContext: AudioContext | null = null;
  let rafHandle = 0;

  try {
    await waitForEvent(video, "loadedmetadata", "Unable to load video for compression.");

    const naturalWidth = video.videoWidth || 1280;
    const naturalHeight = video.videoHeight || 720;
    const longSide = Math.max(naturalWidth, naturalHeight);
    const scale = longSide > options.maxLongSidePx ? options.maxLongSidePx / longSide : 1;
    const targetWidth = Math.max(2, Math.round((naturalWidth * scale) / 2) * 2);
    const targetHeight = Math.max(2, Math.round((naturalHeight * scale) / 2) * 2);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas is unavailable for compression.");
    }

    const canvasWithCapture = canvas as HTMLCanvasElement & {
      captureStream: (frameRate?: number) => MediaStream;
    };
    const combinedStream = new MediaStream();

    for (const track of canvasWithCapture.captureStream(30).getVideoTracks()) {
      combinedStream.addTrack(track);
    }

    try {
      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (AudioContextCtor) {
        audioContext = new AudioContextCtor();
        const sourceNode = audioContext.createMediaElementSource(video);
        const destinationNode = audioContext.createMediaStreamDestination();
        sourceNode.connect(destinationNode);

        for (const track of destinationNode.stream.getAudioTracks()) {
          combinedStream.addTrack(track);
        }
      }
    } catch (audioError) {
      console.warn("[UPLOAD] video compression — audio capture unavailable, output will be silent", audioError);
    }

    const useSafariDefaults = isSafariFamilyRecorder();
    const recorder = useSafariDefaults
      ? new MediaRecorder(combinedStream)
      : (() => {
          const mimeType = pickWebmMimeType();
          return new MediaRecorder(
            combinedStream,
            mimeType
              ? { mimeType, videoBitsPerSecond: options.videoBitsPerSecond, audioBitsPerSecond: 128_000 }
              : undefined
          );
        })();

    const chunks: BlobPart[] = [];
    let stopped = false;

    const drawFrame = () => {
      if (stopped) {
        return;
      }

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

      if (video.duration > 0) {
        options.onProgress?.(Math.min(99, (video.currentTime / video.duration) * 100));
      }

      rafHandle = requestAnimationFrame(drawFrame);
    };

    const compressedFile = await new Promise<File>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => reject(new Error("Video compression failed."));

      recorder.onstop = () => {
        stopped = true;
        cancelAnimationFrame(rafHandle);

        const finalMimeType = recorder.mimeType || (useSafariDefaults ? "video/mp4" : "video/webm");
        const blob = new Blob(chunks, { type: finalMimeType });
        const extension = finalMimeType.includes("mp4") ? "mp4" : "webm";

        if (blob.size === 0) {
          reject(new Error("Video compression produced an empty file."));
          return;
        }

        resolve(new File([blob], `spot-compressed-${Date.now()}.${extension}`, { type: blob.type }));
      };

      video.onended = () => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      };

      // iOS Safari/WKWebView: never pass a timeslice — some Safari versions only flush a valid
      // track on the final (untimed) dataavailable event.
      if (useSafariDefaults) {
        recorder.start();
      } else {
        recorder.start(200);
      }

      rafHandle = requestAnimationFrame(drawFrame);
      video.play().catch(() => reject(new Error("Unable to play video for compression.")));
    });

    return compressedFile;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    audioContext?.close().catch(() => undefined);
  }
}

export type VideoCompressionOutcome = {
  file: File;
  compressed: boolean;
  originalSizeBytes: number;
  finalSizeBytes: number;
};

/**
 * Compresses a video at most once before upload (1080p, optimized bitrate). The same returned
 * File must be reused for any network retry — never call this again from the upload retry path.
 *
 * Falls back to the original file untouched if compression isn't supported, or if the single
 * pass fails — publishing must never be blocked by this being best-effort.
 */
export async function compressVideoForUploadIfNeeded(
  file: File,
  options: { onProgress?: (percent: number) => void } = {}
): Promise<VideoCompressionOutcome> {
  const originalSizeBytes = file.size;

  if (originalSizeBytes <= VIDEO_COMPRESS_SKIP_BELOW_BYTES) {
    console.log("[UPLOAD] video compression skipped — already under size threshold", {
      fileSizeMb: Math.round((originalSizeBytes / (1024 * 1024)) * 100) / 100,
      skipBelowMb: Math.round((VIDEO_COMPRESS_SKIP_BELOW_BYTES / (1024 * 1024)) * 100) / 100,
    });
    return { file, compressed: false, originalSizeBytes, finalSizeBytes: file.size };
  }

  if (!isVideoCompressionSupported()) {
    console.warn("[UPLOAD] video compression unsupported in this browser — uploading original file");
    return { file, compressed: false, originalSizeBytes, finalSizeBytes: file.size };
  }

  try {
    console.log("[UPLOAD] video compression starting (single pass)", {
      maxLongSidePx: PASS_1080P_ONCE.maxLongSidePx,
      videoBitsPerSecond: PASS_1080P_ONCE.videoBitsPerSecond,
      originalSizeMb: Math.round((originalSizeBytes / (1024 * 1024)) * 100) / 100,
    });

    const compressed = await compressVideoFile(file, {
      ...PASS_1080P_ONCE,
      onProgress: options.onProgress,
    });

    options.onProgress?.(100);

    console.log("[UPLOAD] video compression complete (single pass)", {
      originalSizeMb: Math.round((originalSizeBytes / (1024 * 1024)) * 100) / 100,
      finalSizeMb: Math.round((compressed.size / (1024 * 1024)) * 100) / 100,
      mimeType: compressed.type,
    });

    return {
      file: compressed,
      compressed: true,
      originalSizeBytes,
      finalSizeBytes: compressed.size,
    };
  } catch (compressionError) {
    console.warn("[UPLOAD] video compression failed — uploading original file", compressionError);
    options.onProgress?.(100);
    return { file, compressed: false, originalSizeBytes, finalSizeBytes: file.size };
  }
}
