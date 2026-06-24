"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Music2, Pause, Play, Search, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  formatSpotMusicDuration,
  searchSpotMusicTracks,
  spotMusicTrackToSelection,
  type SpotMusicSelection,
  type SpotMusicTrack,
} from "@/lib/spotMusic";
import { logMusicSelected, resolveSpotMusicPreviewUrl } from "@/lib/spotMusic/previewUrls";
import { useSpotMusicPreview } from "@/lib/spotMusic/useSpotMusicPreview";

type SpotEditorMusicSheetProps = {
  isOpen: boolean;
  selectedTrack: SpotMusicSelection | null;
  onSelectTrack: (track: SpotMusicSelection) => void;
  onRemoveMusic: () => void;
  onClose: () => void;
};

function TrackCoverArt({ track, size = "md" }: { track: SpotMusicTrack | SpotMusicSelection; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-10 w-10" : "h-12 w-12";

  if (track.coverUrl) {
    return (
      <img
        src={track.coverUrl}
        alt=""
        className={`${dimension} shrink-0 rounded-lg object-cover ring-1 ring-white/10`}
      />
    );
  }

  return (
    <span
      className={`${dimension} flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#1a2548] via-[#0f1628] to-[#080c18] text-lg ring-1 ring-white/10`}
      aria-hidden
    >
      🎵
    </span>
  );
}

export default function SpotEditorMusicSheet({
  isOpen,
  selectedTrack,
  onSelectTrack,
  onRemoveMusic,
  onClose,
}: SpotEditorMusicSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<SpotMusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const searchRequestRef = useRef(0);

  const {
    playingTrackId,
    loadingTrackId,
    errorTrackId,
    errorMessage,
    stopPreview,
    toggleTrackPreview,
  } = useSpotMusicPreview();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopPreview();
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      stopPreview();
    };
  }, [isOpen, stopPreview]);

  const handleClose = useCallback(() => {
    stopPreview();
    onClose();
  }, [onClose, stopPreview]);

  const runSearch = useCallback(async (searchQuery: string) => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setLoading(true);
    setSearchError(null);

    const result = await searchSpotMusicTracks(searchQuery);

    if (searchRequestRef.current !== requestId) {
      return;
    }

    setTracks(result.tracks);
    setUsingFallback(Boolean(result.usedFallback));
    setSearchError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    void runSearch("");
  }, [isOpen, runSearch]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, 280);

    return () => window.clearTimeout(timer);
  }, [isOpen, query, runSearch]);

  const previewErrorLabel = useCallback(
    (trackId: string) => {
      if (errorTrackId !== trackId) {
        return null;
      }

      if (errorMessage === "missing_url") {
        return t("spotEditor.musicNoPreview");
      }

      if (errorMessage === "timeout") {
        return t("spotEditor.musicPreviewTimeout");
      }

      return t("spotEditor.musicPreviewFailed");
    },
    [errorMessage, errorTrackId, t]
  );

  const handleUseTrack = useCallback(
    (track: SpotMusicTrack, catalogIndex: number) => {
      stopPreview();

      const previewUrl = resolveSpotMusicPreviewUrl(track, catalogIndex);
      const selection = {
        ...spotMusicTrackToSelection({ ...track, audioUrl: previewUrl }),
        audioUrl: previewUrl,
      };

      logMusicSelected(selection);
      onSelectTrack(selection);
      onClose();
    },
    [onClose, onSelectTrack, stopPreview]
  );

  if (!isOpen || !mounted) {
    return null;
  }

  const selectedDurationLabel = formatSpotMusicDuration(selectedTrack?.durationSeconds);

  const sheet = (
    <div className="fixed inset-0 z-[140] flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label={t("common.close")}
        onClick={handleClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-editor-music-title"
        className="relative z-10 mx-3 mb-3 flex max-h-[min(82vh,640px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-white/80" strokeWidth={1.75} aria-hidden />
            <h2 id="spot-editor-music-title" className="text-base font-semibold text-white">
              {t("spotEditor.musicSheetTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition active:bg-white/10"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p className="shrink-0 border-b border-white/8 px-5 py-2.5 text-[11px] leading-relaxed text-white/45">
          {t("spotEditor.musicLibraryNotice")}
        </p>

        <p className="shrink-0 border-b border-white/8 px-5 py-2 text-[10px] leading-relaxed text-cyan-200/70">
          {t("spotEditor.musicMetadataOnly")}
        </p>

        {selectedTrack ? (
          <div className="shrink-0 border-b border-white/8 px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {t("spotEditor.musicSelected")}
            </p>
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10">
              <TrackCoverArt track={selectedTrack} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{selectedTrack.title}</p>
                <p className="truncate text-xs text-white/50">{selectedTrack.artist}</p>
                {selectedDurationLabel ? (
                  <p className="mt-0.5 text-[10px] tabular-nums text-white/35">{selectedDurationLabel}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemoveMusic();
                  handleClose();
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition active:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {t("spotEditor.musicRemove")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="shrink-0 border-b border-white/8 px-4 py-3">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("spotEditor.musicSearchPlaceholder")}
              autoComplete="off"
              className="w-full rounded-xl border border-white/10 bg-black/35 py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-400/50"
            />
          </label>
          {usingFallback ? (
            <p className="mt-2 text-[10px] text-amber-200/70">{t("spotEditor.musicFallbackHint")}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("spotEditor.musicSearching")}
            </div>
          ) : tracks.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-white/45">{t("spotEditor.musicNoResults")}</p>
          ) : (
            <ul className="space-y-1">
              {tracks.map((track, index) => {
                const selected = track.id === selectedTrack?.id;
                const durationLabel = formatSpotMusicDuration(track.durationSeconds);
                const previewUrl = resolveSpotMusicPreviewUrl(track, index);
                const isPlaying = playingTrackId === track.id;
                const isLoadingPreview = loadingTrackId === track.id;
                const rowError = previewErrorLabel(track.id);

                return (
                  <li key={track.id}>
                    <div
                      className={`flex items-center gap-2 rounded-xl px-2 py-2 ${
                        selected ? "bg-white/10 ring-1 ring-white/20" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void toggleTrackPreview(track, previewUrl)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition active:bg-white/20"
                        aria-label={isPlaying ? t("spotEditor.musicPause") : t("spotEditor.musicPlay")}
                      >
                        {isLoadingPreview ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : isPlaying ? (
                          <Pause className="h-4 w-4" aria-hidden />
                        ) : (
                          <Play className="h-4 w-4 translate-x-0.5" aria-hidden />
                        )}
                      </button>

                      <TrackCoverArt track={track} size="sm" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-white">{track.title}</p>
                        <p className="truncate text-xs text-white/50">
                          {track.artist}
                          {durationLabel ? ` · ${durationLabel}` : ""}
                        </p>
                        {rowError ? (
                          <p className="mt-0.5 text-[10px] text-red-300/90">{rowError}</p>
                        ) : null}
                      </div>

                      {selected ? (
                        <Check className="h-5 w-5 shrink-0 text-emerald-400" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUseTrack(track, index)}
                          className="shrink-0 rounded-full bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition active:scale-[0.98]"
                        >
                          {t("spotEditor.musicUse")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {searchError ? (
            <p className="px-3 pb-2 text-center text-[11px] text-red-300/80">{searchError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
