export type { MediaEditorDraft, MediaEditorItem, MediaEditorMediaType } from "@/lib/mediaEditor/types";
export { MEDIA_EDITOR_MAX_ITEMS } from "@/lib/mediaEditor/types";
export {
  createMediaEditorItem,
  getActiveMediaEditorItem,
  revokeMediaEditorItem,
  revokeMediaEditorItems,
} from "@/lib/mediaEditor/helpers";
export {
  getClipDurationSeconds,
  getResolvedTrimEnd,
  isVideoTrimReady,
  requiresTrimForVideo,
  videoPublishNeedsExport,
} from "@/lib/mediaEditor/trimValidation";
export { prepareMediaFileForPublish } from "@/lib/mediaEditor/preparePublish";
export {
  formatTrimSummary,
  getCoverContinueBlockReason,
  getTrimContinueBlockReason,
  getVideoPreviewContinueBlockReason,
} from "@/lib/mediaEditor/continueReasons";
