/** Where a catalog row originated — swap providers without changing editor UI. */
export type SpotMusicCatalogProvider = "local" | "licensed";

/** Music attached to a Spot draft (metadata only until export mixing ships). */
export type SpotMusicTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string | null;
  coverUrl: string | null;
  durationSeconds: number | null;
  provider: SpotMusicCatalogProvider;
};

export type SpotMusicSearchResult = {
  tracks: SpotMusicTrack[];
  error: string | null;
  /** True when results came from bundled fallback (offline / table missing). */
  usedFallback?: boolean;
};

export type SpotMusicTrackResult = {
  track: SpotMusicTrack | null;
  error: string | null;
  usedFallback?: boolean;
};

/** Provider contract for future licensed music APIs. */
export type SpotMusicCatalogAdapter = {
  searchTracks(query: string, limit?: number): Promise<SpotMusicSearchResult>;
  getTrackById(trackId: string): Promise<SpotMusicTrackResult>;
};
