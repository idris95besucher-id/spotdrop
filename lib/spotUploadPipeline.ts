import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { prepareMediaFileForPublish, type MediaEditorItem } from "@/lib/mediaEditor";
import { createGeoSpot, type CreateSpotInput } from "@/lib/spots";
import {
  getSpotPublishStageLabel,
  logSpotPublishStage,
  type SpotPublishLabelContext,
  type SpotPublishStage,
} from "@/lib/spotPublishProgress";
import {
  logSpotPublishMediaItemsPayload,
  logSpotPublishUploadedMediaItems,
} from "@/lib/spotMediaLog";
import { requireAuthenticatedUser } from "@/lib/storageUpload";
import { supabase } from "@/lib/supabaseClient";
import {
  finalizeUploadTimingSummary,
  recordUploadStepDuration,
  resetUploadTimingSummary,
  timeUploadStep,
} from "@/lib/spotUploadTiming";

export type SpotUploadProgress = {
  percent: number;
  label: string;
  stage: SpotPublishStage;
};

export type PublishSpotResult = {
  postId: string | null;
  carouselWarning?: string | null;
};

export type PublishSpotInput = {
  userId: string;
  /** All carousel media — first item is the location anchor photo. */
  mediaItems: MediaEditorItem[];
  spotName: string;
  location: CreateSpotInput["location"];
  collectionId?: string | null;
  discoveryPlaces?: DiscoveryPlace[];
  onProgress?: (progress: SpotUploadProgress) => void;
  /** Generated SpotDrop location card (text-only spot). */
  locationCard?: boolean;
  /** Optional user caption — stored in posts.content. */
  caption?: string;
};

/** Integer percent for the upload bar — never stalls below 100 on completion. */
export function spotUploadDisplayPercent(percent: number): number {
  if (percent >= 100) {
    return 100;
  }

  return Math.max(0, Math.min(99, Math.round(percent)));
}

function reportProgress(
  onProgress: PublishSpotInput["onProgress"],
  stage: SpotPublishStage,
  percent: number,
  labelContext: SpotPublishLabelContext
) {
  onProgress?.({
    stage,
    percent,
    label: getSpotPublishStageLabel(stage, labelContext),
  });
}

export async function publishSpotWithProgress(input: PublishSpotInput): Promise<PublishSpotResult> {
  const primaryItem = input.mediaItems[0];

  if (!primaryItem) {
    throw new Error("Media is missing.");
  }

  const totalBytes = input.mediaItems.reduce((sum, item) => sum + item.file.size, 0);
  const totalStartedAt = performance.now();
  resetUploadTimingSummary(totalBytes);

  console.time("[UPLOAD] Total");
  console.log("[UPLOAD] start", {
    itemCount: input.mediaItems.length,
    mediaType: primaryItem.mediaType,
  });

  logSpotPublishMediaItemsPayload(
    input.mediaItems.map((item) => ({
      mediaType: item.mediaType,
      fileSize: item.file.size,
      fileName: item.file.name,
    }))
  );

  logSpotPublishStage("preparing");
  const labelContext: SpotPublishLabelContext = {
    primaryMediaType: primaryItem.mediaType,
    mediaCount: input.mediaItems.length,
    locationCard: input.locationCard,
  };

  reportProgress(input.onProgress, "preparing", 2, labelContext);

  const user = await requireAuthenticatedUser(input.userId);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    console.timeEnd("[UPLOAD] Total");
    throw new Error("Please sign in to upload files.");
  }

  const preparedFiles: Array<{
    file: File;
    mediaType: "image" | "video";
    coverFile: File | null;
    audioMuted: boolean;
  }> = [];

  const exportSlice = 8 / Math.max(input.mediaItems.length, 1);

  for (let index = 0; index < input.mediaItems.length; index += 1) {
    const item = input.mediaItems[index]!;
    const finishExport = timeUploadStep(`[UPLOAD] Export ${index + 1}`);
    const prepared = await prepareMediaFileForPublish(item);
    recordUploadStepDuration("exportDurationMs", finishExport());
    preparedFiles.push({
      file: prepared.file,
      mediaType: item.mediaType,
      coverFile: item.coverFile ?? null,
      audioMuted: prepared.audioMuted,
    });
    reportProgress(input.onProgress, "preparing", 4 + exportSlice * (index + 1), labelContext);
  }

  reportProgress(input.onProgress, "preparing", 12, labelContext);

  const result = await createGeoSpot({
    userId: user.id,
    file: preparedFiles[0]!.file,
    mediaType: preparedFiles[0]!.mediaType,
    spotName: input.spotName,
    location: input.location,
    collectionId: input.collectionId ?? null,
    coverFile: preparedFiles[0]!.coverFile,
    discoveryPlaces: input.discoveryPlaces,
    accessToken,
    carouselPreparedItems: preparedFiles,
    locationCard: input.locationCard,
    caption: input.caption,
    onPublishStage: (stage, percent) => {
      reportProgress(input.onProgress, stage, percent, labelContext);
    },
    onTiming: (phase, durationMs) => {
      if (phase === "thumbnail") {
        recordUploadStepDuration("thumbnailDurationMs", durationMs);
      } else if (phase === "storage") {
        recordUploadStepDuration("storageDurationMs", durationMs);
      } else if (phase === "postInsert") {
        recordUploadStepDuration("postInsertDurationMs", durationMs);
      }
    },
  });

  if (result.error) {
    console.timeEnd("[UPLOAD] Total");
    throw new Error(result.error);
  }

  reportProgress(input.onProgress, "finalizing", 100, labelContext);

  const totalDurationMs = Math.round(performance.now() - totalStartedAt);
  console.timeEnd("[UPLOAD] Total");
  finalizeUploadTimingSummary(totalDurationMs);

  return {
    postId: result.postId,
    carouselWarning: result.carouselWarning ?? null,
  };
}

/** @deprecated Use getSpotPublishStageLabel via SpotUploadProgress.label */
export function spotUploadProgressLabel(
  percent: number,
  context: SpotPublishLabelContext = {
    primaryMediaType: "image",
    mediaCount: 1,
  }
): string {
  if (percent < 12) {
    return getSpotPublishStageLabel("preparing", context);
  }

  if (percent < 42) {
    return getSpotPublishStageLabel("uploading_primary", context);
  }

  if (percent < 72) {
    return getSpotPublishStageLabel("uploading_extra", context);
  }

  if (percent < 86) {
    return getSpotPublishStageLabel("creating_post", context);
  }

  if (percent < 98) {
    return getSpotPublishStageLabel("saving_media_items", context);
  }

  return getSpotPublishStageLabel("finalizing", context);
}
