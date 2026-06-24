import { localSpotMusicLibraryProvider } from "@/lib/spotMusic/localLibraryProvider";
import type {
  SpotMusicCatalogAdapter,
  SpotMusicSearchResult,
  SpotMusicTrack,
  SpotMusicTrackResult,
} from "@/lib/spotMusic/types";

export type { SpotMusicCatalogAdapter, SpotMusicSearchResult, SpotMusicTrack, SpotMusicTrackResult };
export { formatSpotMusicDuration } from "@/lib/spotMusic/format";
export { SPOT_MUSIC_FALLBACK_TRACKS } from "@/lib/spotMusic/fallbackTracks";

/** Active catalog adapter — replace with licensed provider when ready. */
let activeProvider: SpotMusicCatalogAdapter = localSpotMusicLibraryProvider;

export function setSpotMusicCatalogProvider(provider: SpotMusicCatalogAdapter) {
  activeProvider = provider;
}

export function getSpotMusicCatalogProvider() {
  return activeProvider;
}

export async function searchSpotMusicTracks(query: string, limit = 30): Promise<SpotMusicSearchResult> {
  return activeProvider.searchTracks(query, limit);
}

export async function getSpotMusicTrackById(trackId: string): Promise<SpotMusicTrackResult> {
  return activeProvider.getTrackById(trackId);
}

/** Snapshot stored on Spot draft media (metadata only). */
export type SpotMusicSelection = Pick<
  SpotMusicTrack,
  "id" | "title" | "artist" | "audioUrl" | "coverUrl" | "durationSeconds"
>;

export function spotMusicTrackToSelection(track: SpotMusicTrack): SpotMusicSelection {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    audioUrl: track.audioUrl,
    coverUrl: track.coverUrl,
    durationSeconds: track.durationSeconds,
  };
}
