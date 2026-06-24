import type { SpotMusicTrack } from "@/lib/spotMusic/types";

/** Legacy placeholder — all tracks pointed here before per-track URLs were added. */
const LEGACY_SHARED_DEMO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3";

export function isHttpAudioUrl(value: string | null | undefined): value is string {
  if (!value?.trim()) {
    return false;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isLegacySharedDemoUrl(url: string) {
  return url.trim() === LEGACY_SHARED_DEMO_URL;
}

/** Stable index per track id so preview URL does not change with search result order. */
export function stableCatalogIndex(trackId: string, fallbackIndex = 0): number {
  let hash = 0;

  for (let i = 0; i < trackId.length; i++) {
    hash = (hash * 31 + trackId.charCodeAt(i)) >>> 0;
  }

  return hash || fallbackIndex;
}

/**
 * Distinct demo preview MP3 per catalog slot (SoundHelix songs 1–16).
 * Used only when a track has no dedicated `audio_url` in the catalog.
 */
export function spotMusicDemoPreviewUrl(catalogIndex: number) {
  const songNum = (Math.abs(catalogIndex) % 16) + 1;
  return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${songNum}.mp3`;
}

export function resolveSpotMusicPreviewUrl(track: SpotMusicTrack, catalogIndex = 0): string | null {
  const candidate = track.audioUrl?.trim();

  if (isHttpAudioUrl(candidate) && !isLegacySharedDemoUrl(candidate)) {
    return candidate;
  }

  return spotMusicDemoPreviewUrl(stableCatalogIndex(track.id, catalogIndex));
}

export function trackWithResolvedPreviewUrl(track: SpotMusicTrack, catalogIndex = 0): SpotMusicTrack {
  const audioUrl = resolveSpotMusicPreviewUrl(track, catalogIndex);

  if (!audioUrl) {
    return track;
  }

  return { ...track, audioUrl };
}

export function logMusicPlayClicked(track: Pick<SpotMusicTrack, "id" | "title">, audioUrl: string | null) {
  console.log("MUSIC PLAY CLICKED", {
    id: track.id,
    title: track.title,
    audio_url: audioUrl,
  });
}

export function logMusicSelected(track: Pick<SpotMusicTrack, "id" | "title" | "audioUrl">) {
  console.log("MUSIC SELECTED", {
    id: track.id,
    title: track.title,
    audio_url: track.audioUrl ?? null,
  });
}
