import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { prepareMediaFileForPublish, type MediaEditorItem } from "@/lib/mediaEditor";
import { createGeoSpot, type CreateSpotInput } from "@/lib/spots";
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
};

export type PublishSpotInput = {
  userId: string;
  mediaItem: MediaEditorItem;
  spotName: string;
  location: CreateSpotInput["location"];
  collectionId?: string | null;
  manualPlaceId?: string | null;
  discoveryPlaces?: DiscoveryPlace[];
  onProgress?: (progress: SpotUploadProgress) => void;
};

export function spotUploadProgressLabel(percent: number): string {
  if (percent < 20) {
    return "Preparing...";
  }

  if (percent >= 90) {
    return "Finishing...";
  }

  return `Uploading ${spotUploadDisplayPercent(percent)}%`;
}

/** Integer percent for the upload bar — linear mapping (no 25% bucket stall). */
export function spotUploadDisplayPercent(percent: number): number {
  if (percent >= 100) {
    return 100;
  }

  if (percent >= 90) {
    return Math.min(99, Math.round(percent));
  }

  return Math.max(0, Math.min(99, Math.round(percent)));
}

function reportProgress(onProgress: PublishSpotInput["onProgress"], percent: number) {
  onProgress?.({
    percent,
    label: spotUploadProgressLabel(percent),
  });
}

function mapUploadPercent(localPercent: number, start: number, end: number) {
  return start + (localPercent / 100) * (end - start);
}

export async function publishSpotWithProgress(input: PublishSpotInput) {
  const totalStartedAt = performance.now();
  resetUploadTimingSummary(input.mediaItem.file.size);

  console.time("[UPLOAD] Total");
  console.log("[UPLOAD] start", {
    mediaType: input.mediaItem.mediaType,
    videoSizeMb: input.mediaItem.file.size / (1024 * 1024),
    hasCover: Boolean(input.mediaItem.coverFile),
  });

  const user = await requireAuthenticatedUser(input.userId);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    console.timeEnd("[UPLOAD] Total");
    throw new Error("Please sign in to upload files.");
  }

  reportProgress(input.onProgress, 5);

  const finishExport = timeUploadStep("[UPLOAD] Export");
  const publishFile = await prepareMediaFileForPublish(input.mediaItem);
  recordUploadStepDuration("exportDurationMs", finishExport());
  reportProgress(input.onProgress, 15);

  let mediaUploadPercent = 0;
  let coverUploadPercent = input.mediaItem.mediaType === "video" ? 0 : 100;

  const updateCombinedUploadProgress = () => {
    if (input.mediaItem.mediaType === "video") {
      const combined = mediaUploadPercent * 0.78 + coverUploadPercent * 0.22;
      reportProgress(input.onProgress, mapUploadPercent(combined, 15, 88));
      return;
    }

    reportProgress(input.onProgress, mapUploadPercent(mediaUploadPercent, 15, 88));
  };

  const result = await createGeoSpot({
    userId: user.id,
    file: publishFile,
    mediaType: input.mediaItem.mediaType,
    spotName: input.spotName,
    location: input.location,
    collectionId: input.collectionId ?? null,
    manualPlaceId: input.manualPlaceId ?? null,
    coverFile: input.mediaItem.coverFile ?? null,
    discoveryPlaces: input.discoveryPlaces,
    accessToken,
    onMediaUploadProgress: (percent) => {
      mediaUploadPercent = percent;
      updateCombinedUploadProgress();
    },
    onCoverUploadProgress: (percent) => {
      coverUploadPercent = percent;
      updateCombinedUploadProgress();
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

  reportProgress(input.onProgress, 92);

  if (result.error) {
    console.timeEnd("[UPLOAD] Total");
    throw new Error(result.error);
  }

  reportProgress(input.onProgress, 100);

  const totalDurationMs = Math.round(performance.now() - totalStartedAt);
  console.timeEnd("[UPLOAD] Total");
  finalizeUploadTimingSummary(totalDurationMs);

  return result;
}
