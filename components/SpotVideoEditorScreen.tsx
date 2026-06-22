"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  Loader2,
  Lock,
  MapPin,
  Pause,
  Play,
  Scissors,
  Volume2,
  VolumeX,
} from "lucide-react";
import SpotVideoPreviewExitSheet from "@/components/SpotVideoPreviewExitSheet";
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

const FILMSTRIP_COUNT = 8;
/** Touch target — larger than 44px for comfortable iPhone dragging. */
const TRIM_HANDLE_HIT_PX = 56;
/** Visible grip width on the timeline edge. */
const TRIM_HANDLE_GRIP_PX = 24;
/** Side inset so handles can sit outside the filmstrip. */
const TRIM_SIDE_INSET_PX = TRIM_HANDLE_HIT_PX / 2;
/** Timeline height — taller filmstrip thumbnails. */
const TRIM_TRACK_HEIGHT_PX = 104;

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
  onSaveToDrafts: () => void;
  onDiscardVideo: () => void;
  onRetake: () => void;
  onPublish: () => void;
  savingDraft?: boolean;
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
  onSaveToDrafts,
  onDiscardVideo,
  onRetake,
  onPublish,
  savingDraft = false,
}: SpotVideoEditorScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragHandle>(null);
  const initializedRef = useRef(false);
  const coverCaptureRef = useRef(0);
  const coverInitializedRef = useRef(false);
  // Use a ref for muted so stale closures in callbacks always read the latest value.
  const previewMutedRef = useRef(true);

  const [loadingDuration, setLoadingDuration] = useState(item.sourceDuration <= 0);
  const [filmstrip, setFilmstrip] = useState<FilmstripFrame[]>([]);
  const [filmstripLoading, setFilmstripLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [coverTime, setCoverTime] = useState(0);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [showTrim, setShowTrim] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isDraggingTrim, setIsDraggingTrim] = useState(false);
  const [activeTrimHandle, setActiveTrimHandle] = useState<DragHandle>(null);
  /** Local preview while dragging — keeps handles glued to the finger without React/parent lag. */
  const [dragPreview, setDragPreview] = useState<{ start: number; end: number } | null>(null);
  const [showExitSheet, setShowExitSheet] = useState(false);
  const trimDragRafRef = useRef<number | null>(null);
  const trimDragPendingXRef = useRef<number | null>(null);
  const dragPreviewRef = useRef<{ start: number; end: number } | null>(null);

  const sourceDuration = item.sourceDuration;
  const trimStart = item.trimStart;
  const trimEnd = item.trimEnd;
  const resolvedEnd = getResolvedTrimEndValue(trimEnd, sourceDuration);
  const clipDuration = getClipDurationFromTrim(trimStart, trimEnd, sourceDuration);

  const trimBlockReason = offlineMode ? null : getVideoPreviewContinueBlockReason(item);
  const publishDisableReason = publishing
    ? offlineMode ? "Saving offline draft…" : "Publishing spot…"
    : offlineMode ? null : trimBlockReason ?? publishStatusMessage;
  const publishBlocked = publishDisableReason !== null;

  const playheadRatio = timeToRatio(currentTime, sourceDuration);
  const coverRatio = timeToRatio(coverTime, sourceDuration);

  const displayTrimStart = dragPreview?.start ?? trimStart;
  const displayTrimEnd = dragPreview?.end ?? resolvedEnd;
  const displayStartRatio = timeToRatio(displayTrimStart, sourceDuration);
  const displayEndRatio = timeToRatio(displayTrimEnd, sourceDuration);
  const displayClipDuration = Math.max(0, displayTrimEnd - displayTrimStart);

  // First private collection = "My Spots"; fall back to any first collection.
  const mySpotsCollection =
    collections.find((c) => c.visibility === "private") ?? collections[0] ?? null;

  const setMuted = useCallback((muted: boolean) => {
    previewMutedRef.current = muted;
    setPreviewMuted(muted);
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, []);

  // ── Cover capture ─────────────────────────────────────────────────────────

  const applyCoverFromTime = useCallback(
    async (time: number) => {
      const video = videoRef.current;
      if (!video || !isReady) return;

      const token = ++coverCaptureRef.current;
      try {
        const blob = await captureVideoFrameBlob(video, time);
        if (token !== coverCaptureRef.current) return;

        const file = coverBlobToFile(blob);
        const preview = URL.createObjectURL(blob);
        if (item.coverPreviewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(item.coverPreviewUrl);
        }
        onItemChange({ coverFile: file, coverPreviewUrl: preview });
        setCoverTime(time);
      } catch {
        // keep previous cover
      }
    },
    [isReady, item.coverPreviewUrl, onItemChange]
  );

  // ── Duration / trim init ──────────────────────────────────────────────────

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
        if (!cancelled) setLoadingDuration(false);
        return;
      }

      if (requiresTrimForVideo(duration)) {
        onItemChange({ sourceDuration: duration, trimStart: 0, trimEnd: MAX_TRIM_CLIP_SECONDS, trimConfirmed: true });
        onTrimChange(0, MAX_TRIM_CLIP_SECONDS);
      } else {
        onItemChange({ sourceDuration: duration, trimStart: 0, trimEnd: duration, trimConfirmed: true });
        onTrimChange(0, duration);
      }

      if (!initializedRef.current) initializedRef.current = true;
      setLoadingDuration(false);
    });

    return () => { cancelled = true; };
  }, [item.previewUrl, onItemChange, onTrimChange, sourceDuration]);

  // ── Filmstrip ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setFilmstripLoading(true);

    void generateFilmstripFrames(item.previewUrl, FILMSTRIP_COUNT).then((frames) => {
      if (cancelled) { revokeFilmstripFrames(frames); return; }
      setFilmstrip((current) => { revokeFilmstripFrames(current); return frames; });
      setFilmstripLoading(false);
    });

    return () => { cancelled = true; };
  }, [item.previewUrl]);

  useEffect(() => {
    return () => { revokeFilmstripFrames(filmstrip); };
  }, [filmstrip]);

  // ── Playback ──────────────────────────────────────────────────────────────

  const seekVideo = useCallback(
    (time: number, autoplay = false) => {
      const video = videoRef.current;
      if (!video || sourceDuration <= 0) return;

      const clamped = Math.max(0, Math.min(time, sourceDuration - 0.02));

      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        setCurrentTime(video.currentTime);
        if (autoplay && video.paused) void video.play().catch(() => undefined);
      };

      if (Math.abs(video.currentTime - clamped) < 0.03) {
        setCurrentTime(clamped);
        if (autoplay && video.paused) void video.play().catch(() => undefined);
        return;
      }

      video.addEventListener("seeked", onSeeked);
      video.currentTime = clamped;
    },
    [sourceDuration]
  );

  const prepareAndAutoplay = useCallback(async () => {
    const video = videoRef.current;
    if (!video || sourceDuration <= 0) return;

    // Must start muted for iOS autoplay policy; user can unmute via toolbar.
    video.muted = true;
    previewMutedRef.current = true;
    setPreviewMuted(true);
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
    if (!isReady || sourceDuration <= 0 || coverInitializedRef.current) return;
    coverInitializedRef.current = true;
    void applyCoverFromTime(trimStart > 0 ? trimStart : 0.01);
  }, [isReady, sourceDuration, trimStart, applyCoverFromTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || resolvedEnd <= trimStart) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= resolvedEnd - 0.05) {
        video.currentTime = trimStart;
        if (!video.paused) void video.play().catch(() => undefined);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [trimStart, resolvedEnd]);

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isReady) return;

    // Restore the user-chosen mute state on each play action.
    video.muted = previewMutedRef.current;

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

  // ── Trim drag ─────────────────────────────────────────────────────────────

  const applyTrimFromClientX = useCallback(
    (clientX: number, handle: DragHandle) => {
      const track = trackRef.current;
      if (!track || !handle || sourceDuration <= 0) return;

      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const time = ratioToTime(ratio, sourceDuration);

      const currentStart = dragPreviewRef.current?.start ?? trimStart;
      const currentEnd = dragPreviewRef.current?.end ?? resolvedEnd;

      const next =
        handle === "start"
          ? clampTrimSelection(time, currentEnd, sourceDuration)
          : clampTrimSelection(currentStart, time, sourceDuration);

      const preview = { start: next.start, end: next.end };
      dragPreviewRef.current = preview;
      setDragPreview(preview);
    },
    [resolvedEnd, sourceDuration, trimStart]
  );

  const commitTrimPreview = useCallback(() => {
    const preview = dragPreviewRef.current;
    if (!preview || sourceDuration <= 0) return;

    onTrimChange(preview.start, preview.end);
    onItemChange({ trimConfirmed: true });

    const handle = dragRef.current;
    const seekTarget =
      handle === "end"
        ? Math.max(preview.start, preview.end - 0.05)
        : preview.start;
    seekVideo(seekTarget, false);
  }, [onItemChange, onTrimChange, seekVideo, sourceDuration]);

  const endTrimDrag = useCallback(() => {
    commitTrimPreview();

    dragRef.current = null;
    setIsDraggingTrim(false);
    setActiveTrimHandle(null);
    dragPreviewRef.current = null;
    setDragPreview(null);
    trimDragPendingXRef.current = null;

    if (trimDragRafRef.current !== null) {
      window.cancelAnimationFrame(trimDragRafRef.current);
      trimDragRafRef.current = null;
    }

    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }, [commitTrimPreview]);

  useEffect(() => {
    return () => {
      endTrimDrag();
    };
  }, [endTrimDrag]);

  const startTrimDrag = useCallback(
    (handle: DragHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (publishing || loadingDuration || !handle) return;

      event.preventDefault();
      event.stopPropagation();

      const video = videoRef.current;
      if (video) {
        video.pause();
        setIsPlaying(false);
      }

      dragRef.current = handle;
      setIsDraggingTrim(true);
      setActiveTrimHandle(handle);

      const initialPreview = { start: trimStart, end: resolvedEnd };
      dragPreviewRef.current = initialPreview;
      setDragPreview(initialPreview);

      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may fail on some browsers.
      }

      applyTrimFromClientX(event.clientX, handle);

      const captureTarget = event.currentTarget;

      const onMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        trimDragPendingXRef.current = moveEvent.clientX;

        if (trimDragRafRef.current !== null) return;

        trimDragRafRef.current = window.requestAnimationFrame(() => {
          trimDragRafRef.current = null;
          const pendingX = trimDragPendingXRef.current;
          const activeHandle = dragRef.current;
          if (pendingX === null || !activeHandle) return;
          applyTrimFromClientX(pendingX, activeHandle);
        });
      };

      const onEnd = (endEvent: PointerEvent) => {
        if (captureTarget.hasPointerCapture(endEvent.pointerId)) {
          try {
            captureTarget.releasePointerCapture(endEvent.pointerId);
          } catch {
            // ignore
          }
        }

        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onEnd);
        document.removeEventListener("pointercancel", onEnd);
        endTrimDrag();
      };

      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onEnd);
      document.addEventListener("pointercancel", onEnd);
    },
    [applyTrimFromClientX, endTrimDrag, loadingDuration, publishing, resolvedEnd, trimStart]
  );

  const handleFrameTap = (time: number) => {
    if (dragRef.current || publishing) return;
    const video = videoRef.current;
    if (video) { video.pause(); setIsPlaying(false); }
    seekVideo(time, false);
    void applyCoverFromTime(time);
  };

  // ── Location label ────────────────────────────────────────────────────────

  const locationLabel = locating
    ? "Locating…"
    : location
      ? (location.city ?? location.country ?? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`)
      : null;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
    <div
      className="fixed inset-0 z-[130] bg-black text-white select-none overflow-hidden"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Publishing overlay */}
      {publishing ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 px-6">
          <Loader2 className="h-9 w-9 animate-spin text-white" aria-hidden />
          <p className="text-sm font-medium text-white">
            {offlineMode ? "Saving draft…" : "Publishing spot…"}
          </p>
        </div>
      ) : null}

      {/* ── Fullscreen video (tap to play/pause) ── */}
      <button
        type="button"
        onClick={() => void togglePlayback()}
        className="absolute inset-0 z-0 h-full w-full focus:outline-none"
        style={{ pointerEvents: isDraggingTrim ? "none" : "auto" }}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <video
          ref={videoRef}
          src={item.previewUrl}
          poster={item.coverPreviewUrl ?? undefined}
          className="h-full w-full object-cover"
          playsInline
          muted
          preload="auto"
          disablePictureInPicture
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            v.setAttribute("playsinline", "true");
            v.setAttribute("webkit-playsinline", "true");
            v.muted = true;
            void prepareAndAutoplay();
          }}
          onCanPlay={() => { if (!isReady) void prepareAndAutoplay(); }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {!isReady ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden />
          </div>
        ) : null}

        {/* Play/pause icon — fades out while playing */}
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${isPlaying ? "opacity-0" : "opacity-100"}`}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm ring-2 ring-white/60">
            <Play className="ml-1 h-7 w-7" fill="currentColor" aria-hidden />
          </span>
        </span>
      </button>

      {/* ── Gradient overlays ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-black/70 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-80 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
      />

      {/* ── Top controls ── */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={() => setShowExitSheet(true)}
          disabled={publishing || savingDraft}
          className="mt-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm disabled:opacity-50"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <button
          type="button"
          onClick={onRetake}
          disabled={publishing}
          className="mt-2.5 rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm disabled:opacity-50"
        >
          Retake
        </button>
      </div>

      {/* ── Right sidebar tools ── */}
      <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-3">
        {/* Mute / unmute preview */}
        <button
          type="button"
          onClick={() => setMuted(!previewMuted)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
          aria-label={previewMuted ? "Unmute preview" : "Mute preview"}
        >
          {previewMuted ? (
            <VolumeX className="h-5 w-5" aria-hidden />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden />
          )}
        </button>
        <span className="text-[9px] font-medium text-white/60">
          {previewMuted ? "Muted" : "Sound"}
        </span>

        {/* Trim toggle */}
        <button
          type="button"
          onClick={() => setShowTrim((v) => !v)}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white backdrop-blur-sm transition ${
            showTrim ? "bg-white/30 ring-2 ring-white/50" : "bg-black/50"
          }`}
          aria-label="Trim video"
          aria-pressed={showTrim}
        >
          <Scissors className="h-5 w-5" aria-hidden />
        </button>
        <span className="text-[9px] font-medium text-white/60">Trim</span>
      </div>

      {/* ── Bottom overlay ── */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 px-3 pb-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Trim timeline (shown when trim tool is active) */}
        {showTrim ? (
          <div className="mb-1 touch-none select-none" style={{ touchAction: "none" }}>
            {/* Live times while dragging */}
            {isDraggingTrim ? (
              <div className="mb-2 flex items-center justify-between rounded-full bg-black/80 px-4 py-2 text-xs font-semibold tabular-nums text-white ring-1 ring-white/30 backdrop-blur-sm">
                <span>Start {formatTrimTime(displayTrimStart)}</span>
                <span className="text-white/50">·</span>
                <span>End {formatTrimTime(displayTrimEnd)}</span>
                <span className="text-white/50">·</span>
                <span className="text-emerald-300">{formatTrimTime(displayClipDuration)}</span>
              </div>
            ) : (
              <div className="mb-2 flex items-center justify-between text-xs tabular-nums text-white/70">
                <span>{formatTrimTime(trimStart)}</span>
                <span>
                  {formatTrimTime(clipDuration)} / {formatTrimTime(MAX_TRIM_CLIP_SECONDS)}
                </span>
                <span>{formatTrimTime(resolvedEnd)}</span>
              </div>
            )}

            <div className="relative touch-none select-none py-1" style={{ touchAction: "none" }}>
              <div
                ref={trackRef}
                className="relative overflow-hidden rounded-2xl bg-white/5 ring-2 ring-white/30"
                style={{
                  touchAction: "none",
                  height: TRIM_TRACK_HEIGHT_PX,
                  marginLeft: TRIM_SIDE_INSET_PX,
                  marginRight: TRIM_SIDE_INSET_PX,
                }}
              >
                <div className="absolute inset-0 flex">
                  {filmstripLoading || filmstrip.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-white/40" aria-hidden />
                    </div>
                  ) : (
                    filmstrip.map((frame) => (
                      <button
                        key={frame.url}
                        type="button"
                        disabled={publishing || loadingDuration || isDraggingTrim}
                        onClick={() => handleFrameTap(frame.time)}
                        className="h-full min-w-0 flex-1 overflow-hidden disabled:pointer-events-none"
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
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 bg-black/70"
                      style={{ left: 0, width: `${displayStartRatio * 100}%` }}
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 bg-black/70"
                      style={{ left: `${displayEndRatio * 100}%`, right: 0 }}
                    />
                    {/* Strong selection border */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 rounded-sm border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_12px_rgba(255,255,255,0.35)]"
                      style={{
                        left: `${displayStartRatio * 100}%`,
                        width: `${Math.max((displayEndRatio - displayStartRatio) * 100, 0.5)}%`,
                      }}
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 z-20 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)]"
                      style={{ left: `${playheadRatio * 100}%` }}
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute top-1 z-20 h-3 w-3 -translate-x-1/2 rounded-full bg-cyan-300 ring-2 ring-white"
                      style={{ left: `${coverRatio * 100}%` }}
                      title="Cover frame"
                    />
                  </>
                ) : null}
              </div>

              {sourceDuration > 0 ? (
                <div
                  className="pointer-events-none absolute inset-y-1"
                  style={{ left: TRIM_SIDE_INSET_PX, right: TRIM_SIDE_INSET_PX }}
                >
                  <button
                    type="button"
                    disabled={publishing || loadingDuration}
                    aria-label="Adjust clip start"
                    onPointerDown={(e) => startTrimDrag("start", e)}
                    className={`pointer-events-auto absolute z-40 flex cursor-ew-resize items-center justify-center touch-none select-none ${
                      activeTrimHandle === "start" ? "scale-105" : ""
                    }`}
                    style={{
                      left: `${displayStartRatio * 100}%`,
                      top: "50%",
                      width: TRIM_HANDLE_HIT_PX,
                      height: TRIM_HANDLE_HIT_PX,
                      transform: "translate(-50%, -50%)",
                      touchAction: "none",
                    }}
                  >
                    <span
                      className="flex items-center justify-center rounded-l-lg bg-white shadow-[0_2px_16px_rgba(0,0,0,0.65)] ring-[3px] ring-white"
                      style={{ width: TRIM_HANDLE_GRIP_PX, height: TRIM_TRACK_HEIGHT_PX - 8 }}
                    >
                      <span className="flex flex-col gap-1" aria-hidden>
                        <span className="block h-[3px] w-[6px] rounded-full bg-neutral-500" />
                        <span className="block h-[3px] w-[6px] rounded-full bg-neutral-500" />
                        <span className="block h-[3px] w-[6px] rounded-full bg-neutral-500" />
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={publishing || loadingDuration}
                    aria-label="Adjust clip end"
                    onPointerDown={(e) => startTrimDrag("end", e)}
                    className={`pointer-events-auto absolute z-40 flex cursor-ew-resize items-center justify-center touch-none select-none ${
                      activeTrimHandle === "end" ? "scale-105" : ""
                    }`}
                    style={{
                      left: `${displayEndRatio * 100}%`,
                      top: "50%",
                      width: TRIM_HANDLE_HIT_PX,
                      height: TRIM_HANDLE_HIT_PX,
                      transform: "translate(-50%, -50%)",
                      touchAction: "none",
                    }}
                  >
                    <span
                      className="flex items-center justify-center rounded-r-lg bg-white shadow-[0_2px_16px_rgba(0,0,0,0.65)] ring-[3px] ring-white"
                      style={{ width: TRIM_HANDLE_GRIP_PX, height: TRIM_TRACK_HEIGHT_PX - 8 }}
                    >
                      <span className="flex flex-col gap-1" aria-hidden>
                        <span className="block h-[3px] w-[6px] rounded-full bg-neutral-500" />
                        <span className="block h-[3px] w-[6px] rounded-full bg-neutral-500" />
                        <span className="block h-[3px] w-[6px] rounded-full bg-neutral-500" />
                      </span>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>

            <p className="mt-2 text-center text-[11px] text-white/50">
              Drag the white handles · tap a thumbnail for cover
            </p>
          </div>
        ) : null}

        {/* Location picker (expanded if user taps location badge) */}
        {showLocationPicker ? (
          <div className="rounded-2xl bg-black/60 p-3 backdrop-blur-md ring-1 ring-white/10">
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
            <button
              type="button"
              onClick={() => setShowLocationPicker(false)}
              className="mt-2 w-full text-center text-xs text-white/50"
            >
              Close
            </button>
          </div>
        ) : null}

        {/* Location badge + caption row */}
        <div className="flex items-center gap-2">
          {locationLabel ? (
            <button
              type="button"
              onClick={() => setShowLocationPicker((v) => !v)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm ring-1 ring-white/15"
            >
              <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden />
              <span className="max-w-[120px] truncate">{locationLabel}</span>
            </button>
          ) : null}

          <input
            value={spotName}
            onChange={(e) => onSpotNameChange(e.target.value)}
            placeholder="Add a caption…"
            maxLength={120}
            disabled={publishing}
            className="min-w-0 flex-1 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white placeholder-white/40 backdrop-blur-sm ring-1 ring-white/15 focus:outline-none focus:ring-white/40 disabled:opacity-50"
          />
        </div>

        {/* Public / My Spots toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onCollectionChange("")}
            disabled={publishing}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-50 ${
              collectionId === ""
                ? "bg-white text-black shadow-lg"
                : "bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-sm"
            }`}
          >
            <Globe className="h-4 w-4" aria-hidden />
            Public Spot
          </button>

          <button
            type="button"
            onClick={() => {
              if (mySpotsCollection) onCollectionChange(mySpotsCollection.id);
            }}
            disabled={publishing || !mySpotsCollection}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-50 ${
              collectionId !== ""
                ? "bg-white text-black shadow-lg"
                : "bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-sm"
            }`}
          >
            <Lock className="h-4 w-4" aria-hidden />
            My Spots
          </button>
        </div>

        {/* Offline / error / status messages */}
        {offlineMode ? (
          <p className="text-center text-xs text-white/55">
            Saved locally · will upload when online
          </p>
        ) : null}
        {error ? (
          <p className="text-center text-xs text-red-400">{error}</p>
        ) : null}
        {!error && publishDisableReason ? (
          <p className="text-center text-xs text-amber-200/80">{publishDisableReason}</p>
        ) : null}

        {/* Publish button */}
        <button
          type="button"
          onClick={() => { if (!publishBlocked) onPublish(); }}
          aria-disabled={publishBlocked}
          className={`flex w-full items-center justify-center gap-1.5 rounded-2xl py-3.5 text-sm font-bold tracking-wide transition ${
            publishBlocked
              ? "cursor-not-allowed bg-white/15 text-white/35"
              : "bg-primary text-background hover:brightness-110 active:scale-[0.98]"
          }`}
        >
          {publishing
            ? offlineMode ? "Saving…" : "Publishing…"
            : offlineMode ? "Save offline draft" : "Share Spot"}
          {!publishing ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      </div>
    </div>

    <SpotVideoPreviewExitSheet
      isOpen={showExitSheet}
      saving={savingDraft}
      onSaveToDrafts={() => {
        setShowExitSheet(false);
        onSaveToDrafts();
      }}
      onDiscard={() => {
        setShowExitSheet(false);
        onDiscardVideo();
      }}
      onCancel={() => setShowExitSheet(false)}
    />
    </>
  );
}
