import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { prepareMediaFileForPublish, type MediaEditorItem } from "@/lib/mediaEditor";
import { createGeoSpot, type CreateSpotInput } from "@/lib/spots";
import { compressVideoForUploadIfNeeded } from "@/lib/videoCompress";
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
import { SPOT_MAX_PHOTOS } from "@/lib/spotMaxPhotos";
import { logSpotPublishStep, spotPublishFail } from "@/lib/spotPublishError";
import { requireAuthenticatedUser } from "@/lib/storageUpload";
import { supabase } from "@/lib/supabaseClient";
import {
  finalizeUploadTimingSummary,
  recordProcessedVideoSize,
  recordUploadStepDuration,
  resetUploadTimingSummary,
  timeUploadStep,
  type UploadTimingSummary,
} from "@/lib/spotUploadTiming";
import type { RetryAttemptInfo } from "@/lib/uploadRetry";
import { logUploadLifecycleEvent } from "@/lib/uploadLifecycleTrace";

export type SpotUploadProgress = {
  percent: number;
  label: string;
  stage: SpotPublishStage;
};

export type PublishSpotResult = {
  postId: string | null;
  carouselWarning?: string | null;
  timing?: UploadTimingSummary;
};

export type PublishSpotInput = {
  userId: string;
  /** All carousel media — first item is the location anchor photo. */
  mediaItems: MediaEditorItem[];
  spotName: string;
  location: CreateSpotInput["location"];
  collectionId?: string | null;
  /** "My Spots" destination — private to the owner, independent of collectionId. */
  publishToMySpots?: boolean;
  discoveryPlaces?: DiscoveryPlace[];
  onProgress?: (progress: SpotUploadProgress) => void;
  /** Generated SpotDrop location card (text-only spot). */
  locationCard?: boolean;
  /** Optional user caption — stored in posts.content. */
  caption?: string;
  /** Cancels in-flight uploads (and any pending retry backoff) — an explicit user cancel or leaving the upload flow, never a rerender or timer. */
  signal?: AbortSignal;
  /** Fired before each automatic upload retry so the UI can show retry status without losing progress. */
  onUploadRetry?: (info: RetryAttemptInfo) => void;
  /** Ties every log line for this publish attempt together — see lib/uploadLifecycleTrace.ts. */
  requestId?: string;
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
    throw new Error(spotPublishFail("validate_media", "Media is missing."));
  }

  if (input.mediaItems.length > SPOT_MAX_PHOTOS) {
    throw new Error(
      spotPublishFail("validate_media", `A Spot can include at most ${SPOT_MAX_PHOTOS} photos.`)
    );
  }

  const totalBytes = input.mediaItems.reduce((sum, item) => sum + item.file.size, 0);
  const totalStartedAt = performance.now();
  resetUploadTimingSummary(totalBytes);

  console.time("[UPLOAD] Total");
  logSpotPublishStep("validate_media", {
    itemCount: input.mediaItems.length,
    mediaType: primaryItem.mediaType,
    totalBytes,
  });
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

  let user;
  let accessToken: string | undefined;

  try {
    logSpotPublishStep("auth");
    user = await requireAuthenticatedUser(input.userId);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    accessToken = session?.access_token;

    if (!accessToken) {
      throw new Error("Please sign in to upload files.");
    }
  } catch (authError) {
    console.timeEnd("[UPLOAD] Total");
    throw new Error(spotPublishFail("auth", authError));
  }

  const preparedFiles: Array<{
    file: File;
    mediaType: "image" | "video";
    coverFile: File | null;
    audioMuted: boolean;
    nativeFilePath?: string | null;
    nativeFileSizeBytes?: number | null;
  }> = [];

  const exportSlice = 8 / Math.max(input.mediaItems.length, 1);

  try {
    for (let index = 0; index < input.mediaItems.length; index += 1) {
      const item = input.mediaItems[index]!;
      const usesNativeDiskPath = Boolean(item.nativeFilePath);
      logSpotPublishStep("prepare_media", {
        index,
        fileName: item.file.name,
        fileSize: usesNativeDiskPath ? item.nativeFileSizeBytes ?? 0 : item.file.size,
        fileType: item.file.type,
        nativeFilePath: item.nativeFilePath ?? null,
      });
      const finishExport = timeUploadStep(`[UPLOAD] Export ${index + 1}`);
      const prepared = await prepareMediaFileForPublish(item);
      recordUploadStepDuration("exportDurationMs", finishExport());

      let finalFile = prepared.file;

      if (item.mediaType === "video" && usesNativeDiskPath) {
        // Native iOS path: compression + upload happen in URLSession from disk.
        // Do NOT run JS canvas compress or load the file into memory here.
        console.log("[SPOT-VIDEO-TIMING] prepare — native disk path (skip JS compress / memory load)", {
          index,
          nativeFilePath: item.nativeFilePath,
          originalSizeBytes: item.nativeFileSizeBytes ?? 0,
          readIntoMemoryMs: 0,
          compressMs: 0,
        });
      } else if (item.mediaType === "video") {
        const sliceStart = 4 + exportSlice * index;
        const sliceEnd = 4 + exportSlice * (index + 1);
        const compressionLabelContext: SpotPublishLabelContext = { ...labelContext, compressingVideo: true };

        const finishCompression = timeUploadStep(`[UPLOAD] Compress ${index + 1}`);
        const compressionOutcome = await compressVideoForUploadIfNeeded(finalFile, {
          onProgress: (percent) => {
            const clamped = Math.max(0, Math.min(100, percent));
            reportProgress(
              input.onProgress,
              "preparing",
              sliceStart + (clamped / 100) * (sliceEnd - sliceStart),
              compressionLabelContext
            );
          },
        });
        finishCompression();

        finalFile = compressionOutcome.file;

        if (compressionOutcome.compressed) {
          console.log("[UPLOAD] video compressed before upload", {
            index,
            originalSizeMb: Math.round((compressionOutcome.originalSizeBytes / (1024 * 1024)) * 100) / 100,
            finalSizeMb: Math.round((compressionOutcome.finalSizeBytes / (1024 * 1024)) * 100) / 100,
          });
        }
      }

      if (index === 0) {
        recordProcessedVideoSize(
          usesNativeDiskPath ? item.nativeFileSizeBytes ?? 0 : finalFile.size
        );
        logUploadLifecycleEvent("media-prepared", {
          requestId: input.requestId,
          index,
          originalSizeBytes: usesNativeDiskPath ? item.nativeFileSizeBytes ?? 0 : item.file.size,
          processedSizeBytes: usesNativeDiskPath ? item.nativeFileSizeBytes ?? 0 : finalFile.size,
          reEncoded: !usesNativeDiskPath && finalFile !== item.file,
          nativeDiskUpload: usesNativeDiskPath,
        });
      }

      preparedFiles.push({
        file: finalFile,
        mediaType: item.mediaType,
        coverFile: item.coverFile ?? null,
        audioMuted: prepared.audioMuted,
        nativeFilePath: item.nativeFilePath ?? null,
        nativeFileSizeBytes: item.nativeFileSizeBytes ?? null,
      });
      reportProgress(input.onProgress, "preparing", 4 + exportSlice * (index + 1), labelContext);
    }
  } catch (prepareError) {
    console.timeEnd("[UPLOAD] Total");
    throw new Error(spotPublishFail("prepare_media", prepareError));
  }

  reportProgress(input.onProgress, "preparing", 12, labelContext);

  const primaryPrepared = preparedFiles[0]!;
  console.log("[SPOT-VIDEO-TIMING] final file confirmed before upload", {
    mediaType: primaryPrepared.mediaType,
    path: primaryPrepared.nativeFilePath ? "native-disk" : "web-xhr",
    nativeFilePath: primaryPrepared.nativeFilePath ?? null,
    originalSizeBytes: primaryPrepared.nativeFileSizeBytes ?? primaryPrepared.file.size,
    finalSizeBytes: primaryPrepared.nativeFileSizeBytes ?? primaryPrepared.file.size,
    preparedCount: preparedFiles.length,
  });

  logSpotPublishStep("upload_primary", {
    preparedCount: preparedFiles.length,
    finalSizeBytes: primaryPrepared.nativeFileSizeBytes ?? primaryPrepared.file.size,
    nativeDiskUpload: Boolean(primaryPrepared.nativeFilePath),
  });

  const result = await createGeoSpot({
    userId: user.id,
    file: preparedFiles[0]!.file,
    mediaType: preparedFiles[0]!.mediaType,
    spotName: input.spotName,
    location: input.location,
    collectionId: input.collectionId ?? null,
    publishToMySpots: input.publishToMySpots,
    coverFile: preparedFiles[0]!.coverFile,
    discoveryPlaces: input.discoveryPlaces,
    accessToken,
    signal: input.signal,
    requestId: input.requestId,
    onUploadRetry: input.onUploadRetry,
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
    const failedAtDurationMs = Math.round(performance.now() - totalStartedAt);
    const timing = finalizeUploadTimingSummary(failedAtDurationMs);

    logUploadLifecycleEvent("publish-failed", {
      requestId: input.requestId,
      stage: "upload_primary",
      errorKind: result.errorKind ?? null,
      timing,
    });

    const uploadError = new Error(result.error) as Error & {
      failedPhotoIndex?: number;
      errorKind?: string;
      timing?: UploadTimingSummary;
    };

    if (result.failedPhotoIndex != null) {
      uploadError.failedPhotoIndex = result.failedPhotoIndex;
    }

    if (result.errorKind) {
      uploadError.errorKind = result.errorKind;
    }

    uploadError.timing = timing;

    throw uploadError;
  }

  reportProgress(input.onProgress, "finalizing", 100, labelContext);
  logSpotPublishStep("finalizing", { postId: result.postId });

  const totalDurationMs = Math.round(performance.now() - totalStartedAt);
  console.timeEnd("[UPLOAD] Total");
  const timing = finalizeUploadTimingSummary(totalDurationMs);

  logUploadLifecycleEvent("publish-succeeded", {
    requestId: input.requestId,
    postId: result.postId,
    timing,
  });

  return {
    postId: result.postId,
    carouselWarning: result.carouselWarning ?? null,
    timing,
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
