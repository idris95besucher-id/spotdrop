export type MediaEditorMediaType = "image" | "video";

/** Single photo or video in an editor draft (carousel item). */
export type MediaEditorItem = {
  id: string;
  file: File;
  mediaType: MediaEditorMediaType;
  previewUrl: string;
  /**
   * Absolute iOS filesystem path for a native SpotDropCamera recording.
   * When set, publish uploads via URLSession from disk — the `file` field is an
   * empty stub and must never be base64-decoded or XHR-uploaded.
   */
  nativeFilePath?: string | null;
  /** On-disk size reported by the native recorder (stub `file.size` is always 0). */
  nativeFileSizeBytes?: number | null;
  /**
   * Secondary preview source, only set when `previewUrl` points at a native
   * file (`capacitor://.../_capacitor_file_...`) rather than a `blob:` URL.
   * For native videos without a JS-decoded File, this stays null (no blob fallback).
   */
  fallbackPreviewUrl: string | null;
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
  /** Native multi-frame panorama — viewer should allow horizontal pan. */
  isPanorama?: boolean;
};

export type MediaEditorDraft = {
  items: MediaEditorItem[];
  activeIndex: number;
};

export const MEDIA_EDITOR_MAX_ITEMS = 10;
