import type { SpotGeoLocation } from "@/lib/spotLocation";

export type SpotDraftUploadStatus = "draft" | "ready" | "uploading" | "failed";

export type SpotDraftLocationSource = "device" | "manual" | "media" | "search" | null;

export type SpotDraftMediaMeta = {
  id: string;
  mediaType: "image" | "video";
  fileName: string;
  mimeType: string;
  sourceDuration: number;
  trimStart: number;
  trimEnd: number;
  trimConfirmed: boolean;
  coverFileName: string | null;
  coverMimeType: string | null;
  musicTrackId: string | null;
  musicTrackTitle: string | null;
  musicTrackArtist: string | null;
  musicTrackCoverUrl: string | null;
  musicTrackAudioUrl: string | null;
  musicTrackDurationSeconds: number | null;
};

export type SpotDraftRecord = {
  id: string;
  userId: string;
  spotName: string;
  collectionId: string | null;
  location: SpotGeoLocation | null;
  locationSource: SpotDraftLocationSource;
  matchedPlaceName: string | null;
  media: SpotDraftMediaMeta;
  createdAt: string;
  updatedAt: string;
  uploadStatus: SpotDraftUploadStatus;
  uploadError: string | null;
};

export type SpotDraftBlobField = "media" | "cover";

export type SpotDraftUpsertPayload = {
  id?: string;
  userId: string;
  spotName: string;
  collectionId: string | null;
  location: SpotGeoLocation | null;
  locationSource: SpotDraftLocationSource;
  matchedPlaceName: string | null;
  media: {
    id: string;
    mediaType: "image" | "video";
    file: File;
    sourceDuration: number;
    trimStart: number;
    trimEnd: number;
    trimConfirmed: boolean;
    coverFile: File | null;
    musicTrackId: string | null;
    musicTrackTitle: string | null;
    musicTrackArtist: string | null;
    musicTrackCoverUrl: string | null;
    musicTrackAudioUrl: string | null;
    musicTrackDurationSeconds: number | null;
  };
  uploadStatus: SpotDraftUploadStatus;
  uploadError?: string | null;
};

export type SpotDraftStorageAdapter = {
  listDrafts(userId: string): Promise<SpotDraftRecord[]>;
  getDraft(draftId: string): Promise<SpotDraftRecord | null>;
  getDraftBlob(draftId: string, field: SpotDraftBlobField): Promise<Blob | null>;
  upsertDraft(payload: SpotDraftUpsertPayload): Promise<SpotDraftRecord>;
  updateDraft(draftId: string, patch: Partial<SpotDraftRecord>): Promise<SpotDraftRecord>;
  deleteDraft(draftId: string): Promise<void>;
};
