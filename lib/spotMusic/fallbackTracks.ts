import type { SpotMusicTrack } from "@/lib/spotMusic/types";
import { spotMusicDemoPreviewUrl } from "@/lib/spotMusic/previewUrls";

function demoTrack(
  id: string,
  title: string,
  artist: string,
  durationSeconds: number,
  catalogIndex: number
): SpotMusicTrack {
  return {
    id,
    title,
    artist,
    audioUrl: spotMusicDemoPreviewUrl(catalogIndex),
    coverUrl: null,
    durationSeconds,
    provider: "local",
  };
}

/** Bundled catalog used when Supabase library is unavailable (offline / migration pending). */
export const SPOT_MUSIC_FALLBACK_TRACKS: SpotMusicTrack[] = [
  demoTrack("ambient-walk", "Morning Walk", "SpotDrop", 60, 0),
  demoTrack("city-lights", "City Lights", "SpotDrop Studio", 45, 1),
  demoTrack("soft-groove", "Soft Groove", "SpotDrop Beats", 52, 2),
  demoTrack("open-road", "Open Road", "SpotDrop", 48, 3),
  demoTrack("alpine-air", "Alpine Air", "Local Sounds", 55, 4),
  demoTrack("bern-sunset", "Bern Sunset", "Swiss Vibes", 42, 5),
  demoTrack("night-drive", "Night Drive", "SpotDrop Beats", 58, 6),
  demoTrack("coffee-break", "Coffee Break", "Acoustic Lab", 39, 7),
  demoTrack("lake-reflection", "Lake Reflection", "Calm Collective", 64, 8),
  demoTrack("urban-steps", "Urban Steps", "SpotDrop Studio", 47, 9),
  demoTrack("golden-hour", "Golden Hour", "Horizon Line", 51, 10),
  demoTrack("rainy-window", "Rainy Window", "Ambient Room", 70, 11),
  demoTrack("weekend-walk", "Weekend Walk", "SpotDrop", 44, 12),
  demoTrack("neon-alley", "Neon Alley", "City Pulse", 53, 13),
  demoTrack("quiet-park", "Quiet Park", "Green Notes", 49, 14),
  demoTrack("travel-diary", "Travel Diary", "SpotDrop Beats", 56, 15),
  demoTrack("snowfall", "Snowfall", "Nordic Tone", 62, 16),
  demoTrack("rooftop-view", "Rooftop View", "Skyline", 46, 17),
  demoTrack("market-day", "Market Day", "Local Sounds", 41, 18),
  demoTrack("starlit-path", "Starlit Path", "SpotDrop", 68, 19),
];

export function searchFallbackTracks(query: string, limit = 30): SpotMusicTrack[] {
  const trimmed = query.trim().toLowerCase();

  const pool = trimmed
    ? SPOT_MUSIC_FALLBACK_TRACKS.filter(
        (track) =>
          track.title.toLowerCase().includes(trimmed) || track.artist.toLowerCase().includes(trimmed)
      )
    : SPOT_MUSIC_FALLBACK_TRACKS;

  return pool.slice(0, limit);
}

export function getFallbackTrackById(trackId: string): SpotMusicTrack | null {
  return SPOT_MUSIC_FALLBACK_TRACKS.find((track) => track.id === trackId) ?? null;
}
