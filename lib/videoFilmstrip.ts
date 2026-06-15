import { captureVideoFrameBlob } from "@/lib/videoCover";

export type FilmstripFrame = {
  time: number;
  url: string;
};

function waitForVideoReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      resolve();
      return;
    }

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Unable to load video for filmstrip."));
    };

    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
  });
}

/** Extract thumbnail frames without disturbing the visible preview video element. */
export async function generateFilmstripFrames(
  videoUrl: string,
  frameCount = 12
): Promise<FilmstripFrame[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  try {
    await waitForVideoReady(video);

    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    if (duration <= 0 || frameCount < 1) {
      return [];
    }

    const frames: FilmstripFrame[] = [];
    const safeCount = Math.max(1, frameCount);

    for (let index = 0; index < safeCount; index += 1) {
      const time =
        index === 0
          ? 0.01
          : index === safeCount - 1
            ? Math.max(duration - 0.05, 0.01)
            : (duration / (safeCount - 1)) * index;

      try {
        const blob = await captureVideoFrameBlob(video, time);
        frames.push({ time, url: URL.createObjectURL(blob) });
      } catch {
        // Skip failed frames; continue building the strip.
      }
    }

    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export function revokeFilmstripFrames(frames: FilmstripFrame[]) {
  for (const frame of frames) {
    if (frame.url.startsWith("blob:")) {
      URL.revokeObjectURL(frame.url);
    }
  }
}
