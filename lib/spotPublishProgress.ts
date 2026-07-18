export type SpotPublishStage =
  | "preparing"
  | "uploading_primary"
  | "uploading_extra"
  | "creating_post"
  | "saving_media_items"
  | "finalizing";

export type SpotPublishLabelContext = {
  primaryMediaType: "image" | "video";
  mediaCount: number;
  locationCard?: boolean;
  /** True only while the "preparing" stage is actively re-encoding an oversized video. */
  compressingVideo?: boolean;
};

export const SPOT_PUBLISH_STAGE_LABELS: Record<SpotPublishStage, string> = {
  preparing: "Preparing...",
  uploading_primary: "Uploading photo...",
  uploading_extra: "Uploading additional media...",
  creating_post: "Creating Spot...",
  saving_media_items: "Saving media...",
  finalizing: "Finishing...",
};

export function getSpotPublishStageLabel(
  stage: SpotPublishStage,
  context: SpotPublishLabelContext
): string {
  if (stage === "preparing" && context.compressingVideo) {
    return "Compressing video...";
  }

  if (context.locationCard) {
    if (
      stage === "uploading_primary" ||
      stage === "uploading_extra" ||
      stage === "creating_post" ||
      stage === "saving_media_items"
    ) {
      return "Publishing Spot...";
    }
  }

  switch (stage) {
    case "uploading_primary":
      if (context.mediaCount > 1) {
        return "Uploading media...";
      }

      return context.primaryMediaType === "video" ? "Uploading video..." : "Uploading photo...";
    case "uploading_extra":
      return context.mediaCount > 1 ? "Uploading media..." : SPOT_PUBLISH_STAGE_LABELS.uploading_extra;
    default:
      return SPOT_PUBLISH_STAGE_LABELS[stage];
  }
}

export const SPOT_PUBLISH_POST_INSERT_TIMEOUT_MS = 30_000;
export const SPOT_PUBLISH_MEDIA_ITEMS_TIMEOUT_MS = 20_000;

export function logSpotPublishStage(stage: SpotPublishStage, detail?: Record<string, unknown>) {
  console.log("[Spot publish] stage", stage, detail ?? "");
}

export function logSpotPublish(message: string, detail?: Record<string, unknown>) {
  if (detail) {
    console.log(`[Spot publish] ${message}`, detail);
    return;
  }

  console.log(`[Spot publish] ${message}`);
}

export async function withSpotPublishTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/** Map a 0–100 local value into a global publish percent range. */
export function mapPublishPercent(localPercent: number, start: number, end: number) {
  const clamped = Math.max(0, Math.min(100, localPercent));
  return start + (clamped / 100) * (end - start);
}
