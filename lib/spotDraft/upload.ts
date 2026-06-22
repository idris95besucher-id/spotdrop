import { getSpotDraftStorage } from "@/lib/spotDraft/indexedDbStorage";
import { mediaEditorItemFromDraft } from "@/lib/spotDraft/helpers";
import type { SpotDraftRecord } from "@/lib/spotDraft/types";
import { hasSpotPublishLocation, SPOT_LOCATION_REQUIRED_MESSAGE } from "@/lib/spotPublish";
import { publishSpotWithProgress } from "@/lib/spotUploadPipeline";
import { isLikelyNetworkError } from "@/lib/spotDraft/online";
import type { DiscoveryPlace } from "@/lib/discoveryMap";

export type SpotDraftUploadResult = {
  postId: string | null;
  error: string | null;
};

export async function uploadSpotDraftRecord(
  draft: SpotDraftRecord,
  userId: string,
  options: { discoveryPlaces?: DiscoveryPlace[] } = {}
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

    const result = await publishSpotWithProgress({
      userId,
      mediaItem,
      spotName: draft.spotName,
      location: draft.location!,
      collectionId: draft.collectionId,
      discoveryPlaces: options.discoveryPlaces,
    });

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
  userId: string,
  options: { discoveryPlaces?: DiscoveryPlace[] } = {}
): Promise<SpotDraftUploadResult> {
  const storage = getSpotDraftStorage();
  const draft = await storage.getDraft(draftId);

  if (!draft) {
    return { postId: null, error: "Spot draft not found." };
  }

  return uploadSpotDraftRecord(draft, userId, options);
}
