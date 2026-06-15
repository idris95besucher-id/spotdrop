export async function captureVideoFrameBlob(video: HTMLVideoElement, timeSeconds: number) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const safeTime = Math.max(0, Math.min(timeSeconds, Math.max(duration - 0.05, 0)));

  if (Math.abs(video.currentTime - safeTime) > 0.04) {
    await new Promise<void>((resolve, reject) => {
      const handleSeeked = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error("Unable to read video frame."));
      };

      const cleanup = () => {
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
      };

      video.addEventListener("seeked", handleSeeked);
      video.addEventListener("error", handleError);
      video.currentTime = safeTime;
    });
  } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve, reject) => {
      const handleReady = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error("Unable to read video frame."));
      };

      const cleanup = () => {
        video.removeEventListener("loadeddata", handleReady);
        video.removeEventListener("error", handleError);
      };

      video.addEventListener("loadeddata", handleReady);
      video.addEventListener("error", handleError);
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to capture video frame.");
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to capture video frame."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.9
    );
  });
}

export function coverBlobToFile(blob: Blob, prefix = "video-cover") {
  return new File([blob], `${prefix}-${Date.now()}.jpg`, { type: "image/jpeg" });
}

/** Capture a JPEG cover from a video URL (defaults to ~1s for auto-thumbnail). */
export async function generateVideoCoverFileFromUrl(videoUrl: string, timeSeconds = 1) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    const handleReady = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Unable to load video for cover."));
    };

    const cleanup = () => {
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("loadeddata", handleReady);
    video.addEventListener("error", handleError);
    video.src = videoUrl;
  });

  const blob = await captureVideoFrameBlob(video, timeSeconds);
  video.removeAttribute("src");
  video.load();

  return coverBlobToFile(blob);
}

/** User-picked cover, or auto-generate from the first second of the video. */
export async function resolveVideoCoverFile(
  videoSource: File | string,
  pickedCover: File | null | undefined,
  timeSeconds = 1
) {
  if (pickedCover) {
    return pickedCover;
  }

  const objectUrl = typeof videoSource === "string" ? videoSource : URL.createObjectURL(videoSource);

  try {
    return await generateVideoCoverFileFromUrl(objectUrl, timeSeconds);
  } finally {
    if (typeof videoSource !== "string") {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export async function loadVideoMetadata(videoUrl: string) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.addEventListener("loadedmetadata", () => {
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      cleanup();
    });

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Unable to load video."));
    });

    video.src = videoUrl;
  });
}
