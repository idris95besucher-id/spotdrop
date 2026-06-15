import { prepareMediaFileForPublish } from "@/lib/mediaEditor";
import { hasSpotPublishLocation, resolveSpotName, SPOT_LOCATION_REQUIRED_MESSAGE } from "@/lib/spotPublish";
import { mediaEditorItemFromDraft } from "@/lib/spotDraft/helpers";
import { getSpotDraftStorage } from "@/lib/spotDraft/indexedDbStorage";
import { isLikelyNetworkError } from "@/lib/spotDraft/online";
import type { SpotDraftRecord } from "@/lib/spotDraft/types";
import { createGeoSpot } from "@/lib/spots";

export type SpotDraftUploadResult = {
  postId: string | null;
  error: string | null;
};

export async function uploadSpotDraftRecord(
  draft: SpotDraftRecord,
  userId: string
): Promise<SpotDraftUploadResult> {
  if (draft.userId !== userId) {
    return { postId: null, error: "This draft belongs to another account." };
  }

  if (!hasSpotPublishLocation(draft.location)) {
    return { postId: null, error: SPOT_LOCATION_REQUIRED_MESSAGE };
  }

  const storage = getSpotDraftStorage();

  await storage.updateDraft(draft.id, {
    uploadStatus: "uploading",
    uploadError: null,
  });

  try {
    const mediaBlob = await storage.getDraftBlob(draft.id, "media");

    if (!mediaBlob) {
      throw new Error("Draft media file is missing.");
    }

    const coverBlob = await storage.getDraftBlob(draft.id, "cover");
    const mediaItem = await mediaEditorItemFromDraft(draft, mediaBlob, coverBlob);
    const publishFile = await prepareMediaFileForPublish(mediaItem);

    const result = await createGeoSpot({
      userId,
      file: publishFile,
      mediaType: draft.media.mediaType,
      spotName: resolveSpotName(draft.spotName),
      location: draft.location!,
      collectionId: draft.collectionId,
      manualPlaceId: null,
      coverFile: draft.media.mediaType === "video" ? mediaItem.coverFile : null,
    });

    if (result.error) {
      await storage.updateDraft(draft.id, {
        uploadStatus: "failed",
        uploadError: result.error,
      });

      return { postId: null, error: result.error };
    }

    await storage.deleteDraft(draft.id);
    return { postId: result.postId, error: null };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to upload Spot draft.";
    const uploadError = isLikelyNetworkError(caught)
      ? "You appear to be offline. Try again when your connection returns."
      : message;

    await storage.updateDraft(draft.id, {
      uploadStatus: "failed",
      uploadError,
    });

    return { postId: null, error: uploadError };
  }
}

export async function uploadSpotDraftById(
  draftId: string,
  userId: string
): Promise<SpotDraftUploadResult> {
  const storage = getSpotDraftStorage();
  const draft = await storage.getDraft(draftId);

  if (!draft) {
    return { postId: null, error: "Spot draft not found." };
  }

  return uploadSpotDraftRecord(draft, userId);
}
