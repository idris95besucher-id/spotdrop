export type MediaEditorMediaType = "image" | "video";

/** Single photo or video in an editor draft (carousel item). */
export type MediaEditorItem = {
  id: string;
  file: File;
  mediaType: MediaEditorMediaType;
  previewUrl: string;
  /** When false, publish without audio (videos only). Default true. */
  keepSound: boolean;
  /** Full source video length in seconds (0 until loaded). */
  sourceDuration: number;
  trimStart: number;
  trimEnd: number;
  /** User tapped Apply in the trim editor. */
  trimConfirmed: boolean;
  coverFile: File | null;
  coverPreviewUrl: string | null;
  /** Background music selection (metadata only until export pipeline supports mixing). */
  musicTrackId: string | null;
  musicTrackTitle: string | null;
  musicTrackArtist: string | null;
  musicTrackCoverUrl: string | null;
  musicTrackAudioUrl: string | null;
  musicTrackDurationSeconds: number | null;
};

export type MediaEditorDraft = {
  items: MediaEditorItem[];
  activeIndex: number;
};

export const MEDIA_EDITOR_MAX_ITEMS = 10;
