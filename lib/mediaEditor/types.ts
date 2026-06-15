export type MediaEditorMediaType = "image" | "video";

/** Single photo or video in an editor draft (carousel item). */
export type MediaEditorItem = {
  id: string;
  file: File;
  mediaType: MediaEditorMediaType;
  previewUrl: string;
  /** Full source video length in seconds (0 until loaded). */
  sourceDuration: number;
  trimStart: number;
  trimEnd: number;
  /** User tapped Apply in the trim editor. */
  trimConfirmed: boolean;
  coverFile: File | null;
  coverPreviewUrl: string | null;
};

export type MediaEditorDraft = {
  items: MediaEditorItem[];
  activeIndex: number;
};

export const MEDIA_EDITOR_MAX_ITEMS = 10;
