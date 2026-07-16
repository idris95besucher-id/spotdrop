/** Max video size uploaded without re-encode/compression (50 MB). */
export const MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024;

export type UploadTimingSummary = {
  videoSizeMb: number;
  /** Size of the primary file actually sent over the wire, after prepareMediaFileForPublish (trim/export/reuse). */
  processedVideoSizeMb: number;
  exportDurationMs: number;
  thumbnailDurationMs: number;
  storageDurationMs: number;
  postInsertDurationMs: number;
  totalDurationMs: number;
  averageUploadSpeedMbps: number;
};

const summary: UploadTimingSummary = {
  videoSizeMb: 0,
  processedVideoSizeMb: 0,
  exportDurationMs: 0,
  thumbnailDurationMs: 0,
  storageDurationMs: 0,
  postInsertDurationMs: 0,
  totalDurationMs: 0,
  averageUploadSpeedMbps: 0,
};

export function resetUploadTimingSummary(videoSizeBytes: number) {
  summary.videoSizeMb = Math.round((videoSizeBytes / (1024 * 1024)) * 100) / 100;
  summary.processedVideoSizeMb = 0;
  summary.exportDurationMs = 0;
  summary.thumbnailDurationMs = 0;
  summary.storageDurationMs = 0;
  summary.postInsertDurationMs = 0;
  summary.totalDurationMs = 0;
  summary.averageUploadSpeedMbps = 0;
}

export function recordProcessedVideoSize(bytes: number) {
  summary.processedVideoSizeMb = Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export function recordUploadStepDuration(
  step: keyof Omit<UploadTimingSummary, "videoSizeMb" | "processedVideoSizeMb" | "totalDurationMs" | "averageUploadSpeedMbps">,
  durationMs: number
) {
  summary[step] = durationMs;
}

export function finalizeUploadTimingSummary(totalDurationMs: number) {
  summary.totalDurationMs = totalDurationMs;

  const sizeForSpeed = summary.processedVideoSizeMb || summary.videoSizeMb;
  summary.averageUploadSpeedMbps =
    summary.storageDurationMs > 0
      ? Math.round(((sizeForSpeed * 8) / (summary.storageDurationMs / 1000)) * 100) / 100
      : 0;

  console.log("[UPLOAD] summary", { ...summary });
  return { ...summary };
}

export function timeUploadStep(label: string) {
  console.time(label);
  const startedAt = performance.now();

  return () => {
    console.timeEnd(label);
    return Math.round(performance.now() - startedAt);
  };
}

export function formatFileSizeMb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}
