export type {
  SpotDraftBlobField,
  SpotDraftLocationSource,
  SpotDraftMediaMeta,
  SpotDraftRecord,
  SpotDraftStorageAdapter,
  SpotDraftUploadStatus,
  SpotDraftUpsertPayload,
} from "@/lib/spotDraft/types";

export {
  buildSpotDraftUpsertPayload,
  createSpotDraftId,
  isSpotDraftUploadable,
  mediaEditorItemFromDraft,
  resolveSpotDraftUploadStatus,
  spotDraftLocationLabel,
} from "@/lib/spotDraft/helpers";

export {
  createIndexedDbSpotDraftStorage,
  getSpotDraftStorage,
  setSpotDraftStorage,
} from "@/lib/spotDraft/indexedDbStorage";

export { isDeviceOnline, isLikelyNetworkError } from "@/lib/spotDraft/online";

export { uploadSpotDraftById, uploadSpotDraftRecord, type SpotDraftUploadResult } from "@/lib/spotDraft/upload";
