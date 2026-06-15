import { CAMERA_MAX_VIDEO_SECONDS, pickVideoRecorderMimeType } from "@/lib/cameraCapture";

export const MAX_TRIM_CLIP_SECONDS = CAMERA_MAX_VIDEO_SECONDS;

type VideoWithCaptureStream = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function getCaptureStream(video: HTMLVideoElement) {
  const extended = video as VideoWithCaptureStream;

  return extended.captureStream?.() ?? extended.mozCaptureStream?.() ?? null;
}

export async function getVideoDurationSeconds(source: File | string) {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const shouldRevoke = typeof source !== "string";

  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to read video duration."));
      video.src = url;
    });

    return Number.isFinite(video.duration) ? video.duration : 0;
  } finally {
    if (shouldRevoke) {
      URL.revokeObjectURL(url);
    }
  }
}

/** Re-encode a clip from start to end (inclusive start, exclusive end behavior via duration). */
export async function trimVideoFile(file: File, startSeconds: number, endSeconds: number) {
  const start = Math.max(0, startSeconds);
  const end = Math.max(start, endSeconds);
  const clipDuration = Math.min(end - start, MAX_TRIM_CLIP_SECONDS);

  if (clipDuration <= 0.05) {
    throw new Error("Choose a longer clip.");
  }

  const mimeType = pickVideoRecorderMimeType();

  if (!mimeType) {
    throw new Error("Video trimming is not supported in this browser.");
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to load video for trimming."));
      video.src = url;
    });

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Unable to seek video."));
      video.currentTime = Math.min(start, Math.max(video.duration - 0.05, 0));
    });

    const stream = getCaptureStream(video);

    if (!stream) {
      return file;
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });

    const trimmedFile = await new Promise<File>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => reject(new Error("Trim recording failed."));

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "mp4" : "webm";
        resolve(new File([blob], `spot-trim-${Date.now()}.${extension}`, { type: blob.type }));
      };

      recorder.start(200);

      void video.play().catch(() => {
        // Playback may fail silently on some browsers; recorder still gets frames.
      });

      window.setTimeout(() => {
        video.pause();
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, clipDuration * 1000);
    });

    return trimmedFile;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function clampTrimRange(
  start: number,
  end: number,
  duration: number,
  maxClip = MAX_TRIM_CLIP_SECONDS
) {
  const safeDuration = Math.max(duration, 0);
  let safeStart = Math.max(0, Math.min(start, safeDuration));
  let safeEnd = Math.max(safeStart, Math.min(end, safeDuration));

  if (safeEnd - safeStart > maxClip) {
    safeEnd = safeStart + maxClip;
  }

  if (safeEnd > safeDuration) {
    safeEnd = safeDuration;
    safeStart = Math.max(0, safeEnd - maxClip);
  }

  return { start: safeStart, end: safeEnd };
}
