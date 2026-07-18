/** Stage timings for diagnosing Spot video upload bottlenecks on device. */

export type SpotVideoUploadStage =
  | "capture_bridge"
  | "prepare"
  | "compress"
  | "read_into_memory"
  | "upload_start"
  | "upload"
  | "server_response"
  | "total";

export type SpotVideoUploadDiagnostics = {
  originalSizeBytes: number;
  finalSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  bitrateMbps: number;
  uploadSpeedMbps: number;
  stagesMs: Partial<Record<SpotVideoUploadStage, number>>;
  exactError: string | null;
  path: "native-disk" | "web-xhr";
};

function mb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export function logSpotVideoUploadDiagnostics(label: string, diagnostics: SpotVideoUploadDiagnostics) {
  const stages = diagnostics.stagesMs;
  const bottleneck = Object.entries(stages)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort((a, b) => b[1] - a[1])[0];

  console.log(`[SPOT-VIDEO-TIMING] ${label}`, {
    path: diagnostics.path,
    originalSizeMb: mb(diagnostics.originalSizeBytes),
    finalSizeMb: mb(diagnostics.finalSizeBytes),
    durationSeconds: diagnostics.durationSeconds,
    resolution: `${diagnostics.width}x${diagnostics.height}`,
    bitrateMbps: Math.round(diagnostics.bitrateMbps * 100) / 100,
    uploadSpeedMbps: Math.round(diagnostics.uploadSpeedMbps * 100) / 100,
    stagesMs: stages,
    slowestStage: bottleneck ? { stage: bottleneck[0], ms: bottleneck[1] } : null,
    exactError: diagnostics.exactError,
  });
}

export function createStageTimer() {
  const startedAt = performance.now();
  const marks = new Map<string, number>();

  return {
    mark(stage: string) {
      marks.set(stage, performance.now());
    },
    msSince(stage: string) {
      const at = marks.get(stage);
      if (at == null) {
        return 0;
      }
      return Math.round(performance.now() - at);
    },
    totalMs() {
      return Math.round(performance.now() - startedAt);
    },
  };
}
