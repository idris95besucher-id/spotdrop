import { getFallbackTrackById, searchFallbackTracks } from "@/lib/spotMusic/fallbackTracks";
import { trackWithResolvedPreviewUrl } from "@/lib/spotMusic/previewUrls";
import type {
  SpotMusicCatalogAdapter,
  SpotMusicSearchResult,
  SpotMusicTrack,
  SpotMusicTrackResult,
} from "@/lib/spotMusic/types";
import { supabase } from "@/lib/supabaseClient";

type SpotMusicTrackRow = {
  id: string;
  title: string;
  artist: string;
  audio_url: string | null;
  cover_url: string | null;
  duration: number | null;
};

function isMissingMusicTracksTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42P01" || message.includes("spot_music_tracks");
}

function rowToTrack(row: SpotMusicTrackRow): SpotMusicTrack {
  return {
    id: String(row.id),
    title: row.title,
    artist: row.artist,
    audioUrl: row.audio_url,
    coverUrl: row.cover_url,
    durationSeconds: row.duration ?? null,
    provider: "local",
  };
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_,]/g, (char) => `\\${char}`);
}

export const localSpotMusicLibraryProvider: SpotMusicCatalogAdapter = {
  async searchTracks(query, limit = 30): Promise<SpotMusicSearchResult> {
    const trimmed = query.trim().replace(/,/g, " ");

    let request = supabase
      .from("spot_music_tracks")
      .select("id, title, artist, audio_url, cover_url, duration")
      .eq("is_active", true)
      .order("title", { ascending: true })
      .limit(limit);

    if (trimmed) {
      const pattern = `%${escapeIlikePattern(trimmed)}%`;
      request = request.or(`title.ilike.${pattern},artist.ilike.${pattern}`);
    }

    const { data, error } = await request;

    if (error) {
      if (isMissingMusicTracksTable(error)) {
        return {
          tracks: searchFallbackTracks(trimmed, limit),
          error: null,
          usedFallback: true,
        };
      }

      return {
        tracks: searchFallbackTracks(trimmed, limit),
        error: error.message,
        usedFallback: true,
      };
    }

    return {
      tracks: ((data ?? []) as SpotMusicTrackRow[]).map((row, index) =>
        trackWithResolvedPreviewUrl(rowToTrack(row), index)
      ),
      error: null,
    };
  },

  async getTrackById(trackId): Promise<SpotMusicTrackResult> {
    const { data, error } = await supabase
      .from("spot_music_tracks")
      .select("id, title, artist, audio_url, cover_url, duration")
      .eq("id", trackId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      if (isMissingMusicTracksTable(error)) {
        return { track: getFallbackTrackById(trackId), error: null, usedFallback: true };
      }

      return {
        track: getFallbackTrackById(trackId),
        error: error.message,
        usedFallback: true,
      };
    }

    if (!data) {
      return { track: getFallbackTrackById(trackId), error: null, usedFallback: true };
    }

    return { track: trackWithResolvedPreviewUrl(rowToTrack(data as SpotMusicTrackRow), 0), error: null };
  },
};
