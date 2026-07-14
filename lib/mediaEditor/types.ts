export type MediaEditorMediaType = "image" | "video";

/** Single photo or video in an editor draft (carousel item). */
export type MediaEditorItem = {
  id: string;
  file: File;
  mediaType: MediaEditorMediaType;
  previewUrl: string;
  /**
   * Secondary preview source, only set when `previewUrl` points at a native
   * file (`capacitor://.../_capacitor_file_...`) rather than a `blob:` URL.
   * `CarouselVideoSlide` falls back to this (a `blob:` URL built from the
   * already-decoded `file`) if the native source fails to load — see
   * `createMediaEditorItem`.
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
