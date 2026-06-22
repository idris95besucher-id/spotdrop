import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { prepareMediaFileForPublish, type MediaEditorItem } from "@/lib/mediaEditor";
import { resolveVideoCoverFile } from "@/lib/videoCover";
import { createGeoSpot, type CreateSpotInput } from "@/lib/spots";
import { requireAuthenticatedUser } from "@/lib/storageUpload";
import { supabase } from "@/lib/supabaseClient";
import { spotUploadLog, spotUploadTime } from "@/lib/spotUploadLog";

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

  const bucket = spotUploadDisplayPercent(percent);
  return `Uploading ${bucket}%`;
}

/** Integer percent for the upload bar — matches the label buckets (no decimals). */
export function spotUploadDisplayPercent(percent: number): number {
  if (percent < 20) {
    return Math.max(0, Math.round(percent));
  }

  if (percent >= 90) {
    return 100;
  }

  return Math.max(25, Math.min(75, Math.ceil(percent / 25) * 25));
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
  spotUploadLog("[Spot Upload] pipeline start", {
    mediaType: input.mediaItem.mediaType,
    hasCover: Boolean(input.mediaItem.coverFile),
  });

  const finishAuth = spotUploadTime("auth");
  const user = await requireAuthenticatedUser(input.userId);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error("Please sign in to upload files.");
  }

  finishAuth();

  reportProgress(input.onProgress, 2);

  const finishExport = spotUploadTime("export");
  const publishFile = await prepareMediaFileForPublish(input.mediaItem);
  finishExport();

  reportProgress(input.onProgress, 18);

  let coverFile: File | null = null;

  if (input.mediaItem.mediaType === "video") {
    if (input.mediaItem.coverFile) {
      coverFile = input.mediaItem.coverFile;
      spotUploadLog("[Spot Upload] thumbnail reused (editor cover)");
    } else {
      const finishCover = spotUploadTime("thumbnail");
      coverFile = await resolveVideoCoverFile(publishFile, null, 1);
      finishCover();
    }
  }

  reportProgress(input.onProgress, 20);

  let mediaUploadPercent = 0;
  let coverUploadPercent = input.mediaItem.mediaType === "video" ? 0 : 100;

  const updateCombinedUploadProgress = () => {
    if (input.mediaItem.mediaType === "video") {
      const combined = mediaUploadPercent * 0.78 + coverUploadPercent * 0.22;
      reportProgress(input.onProgress, mapUploadPercent(combined, 20, 88));
      return;
    }

    reportProgress(input.onProgress, mapUploadPercent(mediaUploadPercent, 20, 88));
  };

  const finishUpload = spotUploadTime("upload");
  const result = await createGeoSpot({
    userId: user.id,
    file: publishFile,
    mediaType: input.mediaItem.mediaType,
    spotName: input.spotName,
    location: input.location,
    collectionId: input.collectionId ?? null,
    manualPlaceId: input.manualPlaceId ?? null,
    coverFile,
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
  });
  finishUpload();

  reportProgress(input.onProgress, 92);

  if (result.error) {
    spotUploadLog("[Spot Upload] pipeline failed", result.error);
    throw new Error(result.error);
  }

  reportProgress(input.onProgress, 100);
  spotUploadLog("[Spot Upload] pipeline success", { postId: result.postId });

  return result;
}
