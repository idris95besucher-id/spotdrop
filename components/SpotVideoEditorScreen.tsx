"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, Loader2, Pause, Play } from "lucide-react";
import CollectionPicker from "@/components/CollectionPicker";
import SpotCameraV2Banner from "@/components/SpotCameraV2Banner";
import SpotLocationPicker, { type SpotLocationSourceKind } from "@/components/SpotLocationPicker";
import type { CollectionWithMeta } from "@/lib/collections";
import { getVideoPreviewContinueBlockReason } from "@/lib/mediaEditor/continueReasons";
import type { MediaEditorItem } from "@/lib/mediaEditor";
import {
  clampTrimSelection,
  formatTrimTime,
  getClipDurationFromTrim,
  getResolvedTrimEndValue,
  ratioToTime,
  timeToRatio,
} from "@/lib/mediaEditor/trimTimeline";
import { requiresTrimForVideo } from "@/lib/mediaEditor/trimValidation";
import type { PlaceSearchResult, SpotGeoLocation } from "@/lib/spotLocation";
import { captureVideoFrameBlob, coverBlobToFile } from "@/lib/videoCover";
import {
  generateFilmstripFrames,
  revokeFilmstripFrames,
  type FilmstripFrame,
} from "@/lib/videoFilmstrip";
import { getVideoDurationSeconds, MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";

type DragHandle = "start" | "end" | null;

const FILMSTRIP_COUNT = 12;

type SpotVideoEditorScreenProps = {
  item: MediaEditorItem;
  spotName: string;
  collections: CollectionWithMeta[];
  collectionId: string;
  collectionsLoading?: boolean;
  locating: boolean;
  location: SpotGeoLocation | null;
  locationSource: SpotLocationSourceKind;
  matchedPlaceName: string | null;
  needsLocationChoice: boolean;
  locationHint: string | null;
  publishing: boolean;
  publishStatusMessage: string | null;
  offlineMode?: boolean;
  error: string | null;
  onItemChange: (patch: Partial<MediaEditorItem>) => void;
  onTrimChange: (trimStart: number, trimEnd: number) => void;
  onSpotNameChange: (value: string) => void;
  onCollectionChange: (collectionId: string) => void;
  onUseCurrentLocation: () => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
  onDismiss: () => void;
  onRetake: () => void;
  onPublish: () => void;
};

export default function SpotVideoEditorScreen({
  item,
  spotName,
  collections,
  collectionId,
  collectionsLoading = false,
  locating,
  location,
  locationSource,
  matchedPlaceName,
  needsLocationChoice,
  locationHint,
  publishing,
  publishStatusMessage,
  offlineMode = false,
  error,
  onItemChange,
  onTrimChange,
  onSpotNameChange,
  onCollectionChange,
  onUseCurrentLocation,
  onSelectPlace,
  onDismiss,
  onRetake,
  onPublish,
}: SpotVideoEditorScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragHandle>(null);
  const initializedRef = useRef(false);
  const coverCaptureRef = useRef(0);
  const coverInitializedRef = useRef(false);

  const [loadingDuration, setLoadingDuration] = useState(item.sourceDuration <= 0);
  const [filmstrip, setFilmstrip] = useState<FilmstripFrame[]>([]);
  const [filmstripLoading, setFilmstripLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [coverTime, setCoverTime] = useState(0);

  const sourceDuration = item.sourceDuration;
  const trimStart = item.trimStart;
  const trimEnd = item.trimEnd;
  const resolvedEnd = getResolvedTrimEndValue(trimEnd, sourceDuration);
  const clipDuration = getClipDurationFromTrim(trimStart, trimEnd, sourceDuration);

  const trimBlockReason = offlineMode ? null : getVideoPreviewContinueBlockReason(item);
  const publishDisableReason = publishing
    ? offlineMode
      ? "Saving offline draft…"
      : "Publishing spot…"
    : offlineMode
      ? null
      : trimBlockReason ?? publishStatusMessage;
  const publishBlocked = publishDisableReason !== null;

  const startRatio = timeToRatio(trimStart, sourceDuration);
  const endRatio = timeToRatio(resolvedEnd, sourceDuration);
  const playheadRatio = timeToRatio(currentTime, sourceDuration);
  const coverRatio = timeToRatio(coverTime, sourceDuration);

  const applyCoverFromTime = useCallback(
    async (time: number) => {
      const video = videoRef.current;

      if (!video || !isReady) {
        return;
      }

      const token = ++coverCaptureRef.current;

      try {
        const blob = await captureVideoFrameBlob(video, time);
        if (token !== coverCaptureRef.current) {
          return;
        }

        const file = coverBlobToFile(blob);
        const preview = URL.createObjectURL(blob);

        if (item.coverPreviewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(item.coverPreviewUrl);
        }

        onItemChange({
          coverFile: file,
          coverPreviewUrl: preview,
        });
        setCoverTime(time);
      } catch {
        // Keep previous cover if frame capture fails.
      }
    },
    [isReady, item.coverPreviewUrl, onItemChange]
  );

  useEffect(() => {
    initializedRef.current = false;
    coverInitializedRef.current = false;
  }, [item.previewUrl]);

  useEffect(() => {
    if (sourceDuration > 0) {
      setLoadingDuration(false);
      return;
    }

    let cancelled = false;
    setLoadingDuration(true);

    void getVideoDurationSeconds(item.previewUrl).then((duration) => {
      if (cancelled || duration <= 0) {
        if (!cancelled) {
          setLoadingDuration(false);
        }
        return;
      }

      if (requiresTrimForVideo(duration)) {
        onItemChange({
          sourceDuration: duration,
          trimStart: 0,
          trimEnd: MAX_TRIM_CLIP_SECONDS,
          trimConfirmed: true,
        });
        onTrimChange(0, MAX_TRIM_CLIP_SECONDS);
      } else {
        onItemChange({
          sourceDuration: duration,
          trimStart: 0,
          trimEnd: duration,
          trimConfirmed: true,
        });
        onTrimChange(0, duration);
      }

      if (!initializedRef.current) {
        initializedRef.current = true;
      }

      setLoadingDuration(false);
    });

    return () => {
      cancelled = true;
    };
  }, [item.previewUrl, onItemChange, onTrimChange, sourceDuration]);

  useEffect(() => {
    let cancelled = false;
    setFilmstripLoading(true);

    void generateFilmstripFrames(item.previewUrl, FILMSTRIP_COUNT).then((frames) => {
      if (cancelled) {
        revokeFilmstripFrames(frames);
        return;
      }

      setFilmstrip((current) => {
        revokeFilmstripFrames(current);
        return frames;
      });
      setFilmstripLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [item.previewUrl]);

  useEffect(() => {
    return () => {
      revokeFilmstripFrames(filmstrip);
    };
  }, [filmstrip]);

  const seekVideo = useCallback(
    (time: number, autoplay = false) => {
      const video = videoRef.current;

      if (!video || sourceDuration <= 0) {
        return;
      }

      const clamped = Math.max(0, Math.min(time, sourceDuration - 0.02));

      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        setCurrentTime(video.currentTime);

        if (autoplay && video.paused) {
          void video.play().catch(() => undefined);
        }
      };

      if (Math.abs(video.currentTime - clamped) < 0.03) {
        setCurrentTime(clamped);
        if (autoplay && video.paused) {
          void video.play().catch(() => undefined);
        }
        return;
      }

      video.addEventListener("seeked", onSeeked);
      video.currentTime = clamped;
    },
    [sourceDuration]
  );

  const prepareAndAutoplay = useCallback(async () => {
    const video = videoRef.current;

    if (!video || sourceDuration <= 0) {
      return;
    }

    video.muted = true;
    setIsReady(true);

    const start = trimStart > 0 ? trimStart : 0.01;
    seekVideo(start, false);

    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [seekVideo, sourceDuration, trimStart]);

  useEffect(() => {
    if (!isReady || sourceDuration <= 0 || coverInitializedRef.current) {
      return;
    }

    coverInitializedRef.current = true;
    void applyCoverFromTime(trimStart > 0 ? trimStart : 0.01);
  }, [isReady, sourceDuration, trimStart, applyCoverFromTime]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || resolvedEnd <= trimStart) {
      return;
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      if (video.currentTime >= resolvedEnd - 0.05) {
        video.currentTime = trimStart;
        if (!video.paused) {
          void video.play().catch(() => undefined);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [trimStart, resolvedEnd]);

  const applyTrimUpdate = useCallback(
    (start: number, end: number) => {
      if (sourceDuration <= 0) {
        return;
      }

      const next = clampTrimSelection(start, end, sourceDuration);
      onTrimChange(next.start, next.end);
      onItemChange({ trimConfirmed: true });
      seekVideo(next.start, isPlaying);
    },
    [isPlaying, onItemChange, onTrimChange, seekVideo, sourceDuration]
  );

  const updateFromPointer = useCallback(
    (clientX: number, handle: DragHandle) => {
      const track = trackRef.current;

      if (!track || !handle || sourceDuration <= 0) {
        return;
      }

      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const time = ratioToTime(ratio, sourceDuration);

      if (handle === "start") {
        applyTrimUpdate(time, resolvedEnd);
        return;
      }

      applyTrimUpdate(trimStart, time);
    },
    [applyTrimUpdate, resolvedEnd, sourceDuration, trimStart]
  );

  const startDrag = useCallback(
    (handle: DragHandle, event: ReactPointerEvent) => {
      if (publishing || loadingDuration || !handle) {
        return;
      }

      event.stopPropagation();
      dragRef.current = handle;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromPointer(event.clientX, handle);
    },
    [loadingDuration, publishing, updateFromPointer]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const handle = dragRef.current;

      if (!handle) {
        return;
      }

      updateFromPointer(event.clientX, handle);
    },
    [updateFromPointer]
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragRef.current) {
        return;
      }

      dragRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  const handleFrameTap = (time: number) => {
    if (dragRef.current || publishing) {
      return;
    }

    const video = videoRef.current;

    if (video) {
      video.pause();
      setIsPlaying(false);
    }

    seekVideo(time, false);
    void applyCoverFromTime(time);
  };

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;

    if (!video || !isReady) {
      return;
    }

    video.muted = true;

    if (video.paused) {
      if (video.currentTime < trimStart || video.currentTime >= resolvedEnd - 0.05) {
        video.currentTime = trimStart;
      }

      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }

      return;
    }

    video.pause();
    setIsPlaying(false);
  }, [isReady, resolvedEnd, trimStart]);

  return (
    <div className="fixed inset-0 z-[130] flex min-h-[100dvh] flex-col bg-background text-white select-none">
      <SpotCameraV2Banner />

      {publishing ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 px-6">
          <Loader2 className="h-9 w-9 animate-spin text-white" aria-hidden />
          <p className="text-sm font-medium text-white">Publishing spot…</p>
        </div>
      ) : null}

      <header className="relative z-30 flex shrink-0 items-center justify-between px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onDismiss}
          disabled={publishing}
          className="rounded-full p-2 text-white hover:bg-white/10 disabled:opacity-50"
          aria-label="Save draft and close"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="text-sm font-semibold text-white">New Spot</p>
        <span className="w-9" aria-hidden />
      </header>

      <div className="relative z-20 shrink-0 px-3 pb-2">
        <div className="mb-1 flex items-center justify-between text-[11px] tabular-nums text-white/55">
          <span>{formatTrimTime(trimStart)}</span>
          <span>
            {formatTrimTime(clipDuration)} / {formatTrimTime(MAX_TRIM_CLIP_SECONDS)}
          </span>
          <span>{formatTrimTime(resolvedEnd)}</span>
        </div>

        <div
          ref={trackRef}
          className="relative h-14 touch-none select-none overflow-hidden rounded-xl bg-white/5"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="absolute inset-0 flex">
            {filmstripLoading || filmstrip.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-white/40" aria-hidden />
              </div>
            ) : (
              filmstrip.map((frame) => (
                <button
                  key={frame.url}
                  type="button"
                  disabled={publishing || loadingDuration}
                  onClick={() => handleFrameTap(frame.time)}
                  className="h-full flex-1 overflow-hidden opacity-90"
                  aria-label={`Frame at ${formatTrimTime(frame.time)}`}
                >
                  <img
                    src={frame.url}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
              ))
            )}
          </div>

          {sourceDuration > 0 ? (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 bg-black/60"
                style={{ left: 0, width: `${startRatio * 100}%` }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 bg-black/60"
                style={{ left: `${endRatio * 100}%`, right: 0 }}
              />
              <div
                className="pointer-events-none absolute inset-y-1 rounded-md border-2 border-emerald-400/90"
                style={{
                  left: `${startRatio * 100}%`,
                  width: `${Math.max((endRatio - startRatio) * 100, 2)}%`,
                }}
              />

              <div
                className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]"
                style={{ left: `${playheadRatio * 100}%` }}
              />

              <div
                className="pointer-events-none absolute top-0 z-20 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-300 ring-2 ring-white"
                style={{ left: `${coverRatio * 100}%` }}
                title="Cover frame"
              />

              <button
                type="button"
                disabled={publishing || loadingDuration}
                aria-label="Adjust clip start"
                onPointerDown={(event) => startDrag("start", event)}
                className="absolute inset-y-0 z-30 w-10 -translate-x-1/2 cursor-ew-resize touch-none"
                style={{ left: `${startRatio * 100}%` }}
              >
                <span className="absolute inset-y-2 left-1/2 w-1 -translate-x-1/2 rounded-full bg-white shadow-lg" />
              </button>

              <button
                type="button"
                disabled={publishing || loadingDuration}
                aria-label="Adjust clip end"
                onPointerDown={(event) => startDrag("end", event)}
                className="absolute inset-y-0 z-30 w-10 -translate-x-1/2 cursor-ew-resize touch-none"
                style={{ left: `${endRatio * 100}%` }}
              >
                <span className="absolute inset-y-2 left-1/2 w-1 -translate-x-1/2 rounded-full bg-white shadow-lg" />
              </button>
            </>
          ) : null}
        </div>

        <p className="mt-1.5 text-center text-[10px] text-white/45">
          Drag handles to trim · tap a frame for cover
        </p>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="relative mx-auto flex w-full max-w-md flex-1 items-center justify-center overflow-hidden rounded-2xl bg-neutral-950"
          aria-label={isPlaying ? "Pause video" : "Play video"}
        >
          <video
            ref={videoRef}
            src={item.previewUrl}
            poster={item.coverPreviewUrl ?? undefined}
            className="max-h-full max-w-full object-contain"
            playsInline
            muted
            autoPlay
            loop
            preload="auto"
            disablePictureInPicture
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              video.setAttribute("playsinline", "true");
              video.setAttribute("webkit-playsinline", "true");
              video.muted = true;
              void prepareAndAutoplay();
            }}
            onCanPlay={() => {
              if (!isReady) {
                void prepareAndAutoplay();
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          {!isReady ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden />
            </div>
          ) : null}

          <span
            className={`pointer-events-none absolute flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white ring-2 ring-white/80 backdrop-blur-sm transition ${
              isPlaying ? "opacity-0" : "opacity-100"
            }`}
          >
            {isPlaying ? (
              <Pause className="h-7 w-7" fill="currentColor" aria-hidden />
            ) : (
              <Play className="ml-0.5 h-7 w-7" fill="currentColor" aria-hidden />
            )}
          </span>
        </button>
      </div>

      <div className="relative z-30 max-h-[42vh] shrink-0 overflow-y-auto border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md space-y-3">
          <SpotLocationPicker
            locating={locating}
            location={location}
            locationSource={locationSource}
            matchedPlaceName={matchedPlaceName}
            needsLocationChoice={needsLocationChoice}
            locationHint={locationHint}
            disabled={publishing}
            onUseCurrentLocation={onUseCurrentLocation}
            onSelectPlace={onSelectPlace}
          />

          <input
            value={spotName}
            onChange={(event) => onSpotNameChange(event.target.value)}
            placeholder="Name this spot…"
            maxLength={120}
            disabled={publishing}
            className="sd-input"
          />

          <CollectionPicker
            collections={collections}
            value={collectionId}
            onChange={onCollectionChange}
            disabled={publishing}
            loading={collectionsLoading}
          />

          <p className="text-center text-[11px] text-muted">
            Spots are always public for place discovery on the map and feed.
          </p>

          {offlineMode ? (
            <p className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-center text-sm text-white">
              Saved locally on this device. Upload when you&apos;re back online.
            </p>
          ) : null}

          {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
          {publishDisableReason ? (
            <p className="text-center text-sm text-amber-200/90">{publishDisableReason}</p>
          ) : null}

          <button
            type="button"
            onClick={onRetake}
            disabled={publishing}
            className="w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
          >
            Retake
          </button>

          <button
            type="button"
            onClick={() => {
              if (publishBlocked) {
                return;
              }
              onPublish();
            }}
            aria-disabled={publishBlocked}
            className={`w-full rounded-xl py-3.5 text-sm font-semibold transition ${
              publishBlocked
                ? "cursor-not-allowed bg-primary/35 text-background/50"
                : "bg-primary text-background hover:brightness-110"
            }`}
          >
            {publishing
              ? offlineMode
                ? "Saving…"
                : "Publishing…"
              : offlineMode
                ? "Save offline draft"
                : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
