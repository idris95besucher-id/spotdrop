/** Above this, the upload is close to certain to fail on a real connection — reject before even trying. */
export const VIDEO_UPLOAD_HARD_LIMIT_BYTES = 500 * 1024 * 1024;

/** Above this, log a diagnostic — not a failure, just a flag that this file is more exposed to transient drops. */
export const VIDEO_UPLOAD_WARN_THRESHOLD_BYTES = 150 * 1024 * 1024;

export type VideoTooLargeError = Error & { errorKind: "file-too-large" };

function formatMb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/**
 * Preflight size check for a video about to be uploaded. The in-app camera already targets
 * a bounded bitrate (see packages/spotdrop-camera's AVVideoAverageBitRateKey), so this
 * mainly guards gallery-picked footage, which can be arbitrary 4K/60fps camera-app output
 * with no size ceiling at all.
 */
export function assertVideoUploadSizeAllowed(file: File) {
  if (file.size > VIDEO_UPLOAD_HARD_LIMIT_BYTES) {
    console.error("[UPLOAD] video rejected — exceeds hard size limit", {
      fileSizeMb: formatMb(file.size),
      limitMb: formatMb(VIDEO_UPLOAD_HARD_LIMIT_BYTES),
    });

    const error = new Error(
      `This video is too large to upload (${formatMb(file.size)}MB). Trim it or choose a shorter clip.`
    ) as VideoTooLargeError;
    error.errorKind = "file-too-large";
    throw error;
  }

  if (file.size > VIDEO_UPLOAD_WARN_THRESHOLD_BYTES) {
    console.warn("[UPLOAD] large video — more exposed to transient network failures during upload", {
      fileSizeMb: formatMb(file.size),
      warnThresholdMb: formatMb(VIDEO_UPLOAD_WARN_THRESHOLD_BYTES),
    });
  }
}
