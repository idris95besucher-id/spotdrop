export type { MediaEditorDraft, MediaEditorItem, MediaEditorMediaType } from "@/lib/mediaEditor/types";
export { MEDIA_EDITOR_MAX_ITEMS } from "@/lib/mediaEditor/types";
export {
  createGalleryMediaEditorItem,
  createMediaEditorItem,
  createPanoramaMediaEditorItem,
  getActiveMediaEditorItem,
  revokeMediaEditorItem,
  revokeMediaEditorItems,
  withMeasuredVideoDuration,
} from "@/lib/mediaEditor/helpers";
export {
  getClipDurationSeconds,
  getResolvedTrimEnd,
  isVideoTrimReady,
  requiresTrimForVideo,
  videoPublishNeedsExport,
} from "@/lib/mediaEditor/trimValidation";
export { prepareMediaFileForPublish, type PreparedPublishMedia } from "@/lib/mediaEditor/preparePublish";
export {
  formatTrimSummary,
  getCoverContinueBlockReason,
  getTrimContinueBlockReason,
  getVideoPreviewContinueBlockReason,
} from "@/lib/mediaEditor/continueReasons";
