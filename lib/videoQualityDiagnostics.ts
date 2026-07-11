/** Temporary diagnostics — filter console for `[Video quality]`. */

export type VideoQualitySnapshot = {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  frameRate: number | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  fileName: string | null;
  estimatedBitrateMbps: number | null;
};

export function isIosCompatibleVideoFile(file: File) {
  const type = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();

  if (type === "video/mp4" || type === "video/quicktime" || type.includes("mp4")) {
    return true;
  }

  return /\.(mp4|mov|m4v)(\?|#|$)/i.test(name);
}

export function estimateBitrateMbps(fileSizeBytes: number, durationSeconds: number) {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return null;
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const bitsPerSecond = (fileSizeBytes * 8) / durationSeconds;
  return Math.round((bitsPerSecond / 1_000_000) * 100) / 100;
}

export async function probeVideoFile(file: File): Promise<VideoQualitySnapshot> {
  if (typeof document === "undefined") {
    return {
      width: null,
      height: null,
      durationSeconds: null,
      frameRate: null,
      fileSizeBytes: file.size,
      mimeType: file.type || null,
      fileName: file.name || null,
      estimatedBitrateMbps: null,
    };
  }

  const url = URL.createObjectURL(file);

  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Unable to read video metadata."));
      };

      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("error", onError);
      };

      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("error", onError);
      video.src = url;
    });

    const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;

    return {
      width: video.videoWidth > 0 ? video.videoWidth : null,
      height: video.videoHeight > 0 ? video.videoHeight : null,
      durationSeconds,
      frameRate: null,
      fileSizeBytes: file.size,
      mimeType: file.type || null,
      fileName: file.name || null,
      estimatedBitrateMbps:
        durationSeconds != null ? estimateBitrateMbps(file.size, durationSeconds) : null,
    };
  } catch {
    return {
      width: null,
      height: null,
      durationSeconds: null,
      frameRate: null,
      fileSizeBytes: file.size,
      mimeType: file.type || null,
      fileName: file.name || null,
      estimatedBitrateMbps: null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function snapshotFromVideoTrack(track: MediaStreamTrack | undefined): Pick<
  VideoQualitySnapshot,
  "width" | "height" | "frameRate"
> {
  if (!track) {
    return { width: null, height: null, frameRate: null };
  }

  const settings = track.getSettings();

  return {
    width: typeof settings.width === "number" ? settings.width : null,
    height: typeof settings.height === "number" ? settings.height : null,
    frameRate: typeof settings.frameRate === "number" ? settings.frameRate : null,
  };
}

export function logVideoQuality(
  stage: string,
  snapshot: Partial<VideoQualitySnapshot> & Record<string, unknown>
) {
  const resolution =
    snapshot.width && snapshot.height ? `${snapshot.width}x${snapshot.height}` : null;

  console.log("[Video quality]", stage, {
    resolution,
    originalResolution: resolution,
    originalFps: snapshot.frameRate ?? null,
    originalFileSizeBytes: snapshot.fileSizeBytes ?? null,
    originalMimeType: snapshot.mimeType ?? null,
    originalFileName: snapshot.fileName ?? null,
    durationSeconds: snapshot.durationSeconds ?? null,
    estimatedBitrateMbps: snapshot.estimatedBitrateMbps ?? null,
    exportedResolution: snapshot.exportedResolution ?? snapshot.width ?? null,
    exportedBitrateMbps: snapshot.exportedBitrateMbps ?? snapshot.estimatedBitrateMbps ?? null,
    exportedMimeType: snapshot.exportedMimeType ?? snapshot.mimeType ?? null,
    finalUploadSizeBytes: snapshot.finalUploadSizeBytes ?? snapshot.fileSizeBytes ?? null,
    finalMediaUrl: snapshot.finalMediaUrl ?? null,
    ...snapshot,
  });
}
