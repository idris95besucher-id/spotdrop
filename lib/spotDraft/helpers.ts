import type { MediaEditorItem } from "@/lib/mediaEditor/types";
import { createMediaEditorItem } from "@/lib/mediaEditor/helpers";
import { hasSpotPublishLocation } from "@/lib/spotPublish";
import type {
  SpotDraftRecord,
  SpotDraftUploadStatus,
  SpotDraftUpsertPayload,
} from "@/lib/spotDraft/types";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import type { SpotLocationSourceKind } from "@/components/SpotLocationPicker";

export function createSpotDraftId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `spot-draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveSpotDraftUploadStatus(options: {
  hasMedia: boolean;
  location: SpotGeoLocation | null;
  explicit?: SpotDraftUploadStatus;
}): SpotDraftUploadStatus {
  if (options.explicit) {
    return options.explicit;
  }

  if (options.hasMedia && hasSpotPublishLocation(options.location)) {
    return "ready";
  }

  return "draft";
}

export function buildSpotDraftUpsertPayload(options: {
  id?: string;
  userId: string;
  spotName: string;
  collectionId: string;
  location: SpotGeoLocation | null;
  locationSource: SpotLocationSourceKind;
  matchedPlaceName: string | null;
  mediaItem: MediaEditorItem;
  uploadStatus?: SpotDraftUploadStatus;
  uploadError?: string | null;
}): SpotDraftUpsertPayload {
  return {
    id: options.id,
    userId: options.userId,
    spotName: options.spotName,
    collectionId: options.collectionId || null,
    location: options.location,
    locationSource: options.locationSource,
    matchedPlaceName: options.matchedPlaceName,
    media: {
      id: options.mediaItem.id,
      mediaType: options.mediaItem.mediaType,
      file: options.mediaItem.file,
      sourceDuration: options.mediaItem.sourceDuration,
      trimStart: options.mediaItem.trimStart,
      trimEnd: options.mediaItem.trimEnd,
      trimConfirmed: options.mediaItem.trimConfirmed,
      coverFile: options.mediaItem.coverFile,
      musicTrackId: options.mediaItem.musicTrackId,
      musicTrackTitle: options.mediaItem.musicTrackTitle,
      musicTrackArtist: options.mediaItem.musicTrackArtist,
      musicTrackCoverUrl: options.mediaItem.musicTrackCoverUrl,
      musicTrackAudioUrl: options.mediaItem.musicTrackAudioUrl,
      musicTrackDurationSeconds: options.mediaItem.musicTrackDurationSeconds,
    },
    uploadStatus: resolveSpotDraftUploadStatus({
      hasMedia: true,
      location: options.location,
      explicit: options.uploadStatus,
    }),
    uploadError: options.uploadError ?? null,
  };
}

export async function mediaEditorItemFromDraft(
  draft: SpotDraftRecord,
  mediaBlob: Blob,
  coverBlob: Blob | null
): Promise<MediaEditorItem> {
  const file = new File([mediaBlob], draft.media.fileName, { type: draft.media.mimeType });
  const item = createMediaEditorItem(file, draft.media.mediaType);

  let coverFile: File | null = null;
  let coverPreviewUrl: string | null = null;

  if (coverBlob && draft.media.coverFileName) {
    coverFile = new File(
      [coverBlob],
      draft.media.coverFileName,
      { type: draft.media.coverMimeType ?? coverBlob.type }
    );
    coverPreviewUrl = URL.createObjectURL(coverFile);
  }

  return {
    ...item,
    id: draft.media.id,
    sourceDuration: draft.media.sourceDuration,
    trimStart: draft.media.trimStart,
    trimEnd: draft.media.trimEnd,
    trimConfirmed: draft.media.trimConfirmed,
    coverFile,
    coverPreviewUrl,
    musicTrackId: draft.media.musicTrackId ?? null,
    musicTrackTitle: draft.media.musicTrackTitle ?? null,
    musicTrackArtist: draft.media.musicTrackArtist ?? null,
    musicTrackCoverUrl: draft.media.musicTrackCoverUrl ?? null,
    musicTrackAudioUrl: draft.media.musicTrackAudioUrl ?? null,
    musicTrackDurationSeconds: draft.media.musicTrackDurationSeconds ?? null,
  };
}

export function isSpotDraftUploadable(draft: SpotDraftRecord) {
  return draft.uploadStatus === "ready" || draft.uploadStatus === "failed";
}

export function spotDraftLocationLabel(draft: SpotDraftRecord) {
  if (draft.location?.address?.trim()) {
    return draft.location.address.trim();
  }

  if (draft.location && Number.isFinite(draft.location.latitude) && Number.isFinite(draft.location.longitude)) {
    return `${draft.location.latitude.toFixed(4)}, ${draft.location.longitude.toFixed(4)}`;
  }

  return "Location not set";
}
