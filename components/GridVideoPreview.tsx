"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import {
  registerGridVideoPreview,
  releaseGridVideoPreview,
  subscribeGridPreviewFullscreenClosed,
  subscribeGridPreviewSlotAvailable,
  tryPlayGridVideoPreview,
} from "@/lib/gridVideoPreviewControl";

/** Instagram Explore-style clip length for muted grid autoplay. */
const GRID_VIDEO_CLIP_SECONDS = 3.5;
/** After play() rejects, do not immediately re-enter the slot retry storm. */
const PLAY_FAILURE_COOLDOWN_MS = 2_500;
/** Real viewport ratio required before requesting a play slot. */
const PLAY_VISIBILITY_RATIO = 0.18;
/** Prepare media a bit before the tile enters the viewport. */
const WARM_ROOT_MARGIN = "140px 0px";

type GridVideoPreviewProps = {
  src: string;
  poster?: string | null;
  className?: string;
  imageClassName?: string;
  /** Search Explore only — muted autoplay while visible, short loop, pause off-screen. */
  autoplay?: boolean;
};

function viewportVisibilityRatio(rect: DOMRectReadOnly) {
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;

  if (viewportHeight <= 0 || rect.height <= 0) {
    return 0;
  }

  const visible = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  return Math.max(0, Math.min(1, visible / rect.height));
}

/**
 * Grid tile for a video post — cover frame with a small video badge.
 * Static by default; Search Explore enables muted in-grid autoplay.
 */
export default function GridVideoPreview({
  src,
  poster,
  className,
  imageClassName = "h-full w-full object-cover",
  autoplay = false,
}: GridVideoPreviewProps) {
  const [posterFailed, setPosterFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isIntersectingRef = useRef(false);
  const startingRef = useRef(false);
  const playBlockedUntilRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryUsedRef = useRef(false);
  const playingListenerRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const clearPlayingListener = useCallback(() => {
    const video = videoRef.current;
    const listener = playingListenerRef.current;

    if (video && listener) {
      video.removeEventListener("playing", listener);
    }

    playingListenerRef.current = null;
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const pausePreview = useCallback(() => {
    const video = videoRef.current;
    startingRef.current = false;
    clearPlayingListener();
    clearRetryTimer();
    retryUsedRef.current = false;

    if (!video) {
      setIsPlaying(false);
      return;
    }

    releaseGridVideoPreview(video);
    setIsPlaying(false);
  }, [clearPlayingListener, clearRetryTimer]);

  const warmPreview = useCallback(() => {
    const video = videoRef.current;

    if (!video || !autoplay) {
      return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    if (video.preload !== "auto") {
      video.preload = "auto";
    }
  }, [autoplay]);

  const startPreview = useCallback(async () => {
    const video = videoRef.current;

    if (!video || !autoplay) {
      return;
    }

    if (startingRef.current) {
      return;
    }

    // Already previewing — avoid restarting on every IntersectionObserver tick.
    if (!video.paused && !video.ended) {
      return;
    }

    if (Date.now() < playBlockedUntilRef.current) {
      return;
    }

    if (!tryPlayGridVideoPreview(video)) {
      return;
    }

    startingRef.current = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";

    try {
      video.currentTime = 0;
    } catch {
      /* ignore */
    }

    clearPlayingListener();

    const onPlaying = () => {
      playingListenerRef.current = null;
      if (mountedRef.current) {
        setIsPlaying(true);
      }
    };

    playingListenerRef.current = onPlaying;
    video.addEventListener("playing", onPlaying);

    try {
      // Kick off play as soon as the element has a source; the Promise waits for
      // enough data without an explicit canplay gate (faster on iOS WKWebView).
      // Poster stays until the `playing` event — never hide on play() resolve alone.
      await video.play();
    } catch {
      clearPlayingListener();
      playBlockedUntilRef.current = Date.now() + PLAY_FAILURE_COOLDOWN_MS;
      releaseGridVideoPreview(video);
      setIsPlaying(false);

      // One controlled retry after cooldown — never an immediate retry storm.
      if (!retryUsedRef.current && retryTimerRef.current === null) {
        retryUsedRef.current = true;
        const delay = Math.max(0, playBlockedUntilRef.current - Date.now()) + 40;

        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;

          if (!mountedRef.current || !isIntersectingRef.current || startingRef.current) {
            return;
          }

          if (Date.now() < playBlockedUntilRef.current) {
            return;
          }

          void startPreview();
        }, delay);
      }
    } finally {
      startingRef.current = false;
    }
  }, [autoplay, clearPlayingListener]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearRetryTimer();
      clearPlayingListener();
    };
  }, [clearPlayingListener, clearRetryTimer]);

  useEffect(() => {
    if (!autoplay) {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("muted", "");
    video.preload = "none";
    playBlockedUntilRef.current = 0;
    retryUsedRef.current = false;
    setIsPlaying(false);

    const unregister = registerGridVideoPreview(video);

    const handleTimeUpdate = () => {
      if (video.currentTime >= GRID_VIDEO_CLIP_SECONDS) {
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      clearPlayingListener();
      clearRetryTimer();
      releaseGridVideoPreview(video);
      unregister();
    };
  }, [autoplay, clearPlayingListener, clearRetryTimer, src]);

  useEffect(() => {
    if (!autoplay) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    const applyVisibility = (rect: DOMRectReadOnly, nearViewport: boolean) => {
      const ratio = viewportVisibilityRatio(rect);
      const inView = ratio >= PLAY_VISIBILITY_RATIO;

      isIntersectingRef.current = inView;

      if (inView) {
        void startPreview();
        return;
      }

      if (nearViewport) {
        warmPreview();
        return;
      }

      pausePreview();
    };

    const isNearViewport = (rect: DOMRectReadOnly) => {
      const viewportHeight = window.innerHeight || 0;
      const margin = 140;
      return rect.top < viewportHeight + margin && rect.bottom > -margin;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        // rootMargin makes isIntersecting true slightly early — use that for warm-up only.
        applyVisibility(entry.boundingClientRect, entry.isIntersecting);
      },
      {
        rootMargin: WARM_ROOT_MARGIN,
        threshold: [0, 0.05, 0.1, 0.18, 0.25, 0.5, 0.75, 1],
      }
    );

    observer.observe(container);

    // Cold-start: do not wait for the first async IO callback when already on-screen.
    const initialRect = container.getBoundingClientRect();
    applyVisibility(initialRect, isNearViewport(initialRect));

    return () => {
      observer.disconnect();
      pausePreview();
    };
  }, [autoplay, pausePreview, src, startPreview, warmPreview]);

  useEffect(() => {
    if (!autoplay) {
      return;
    }

    const retryIfVisible = () => {
      if (!isIntersectingRef.current || startingRef.current) {
        return;
      }

      const video = videoRef.current;

      if (video && !video.paused && !video.ended) {
        return;
      }

      if (Date.now() < playBlockedUntilRef.current) {
        return;
      }

      void startPreview();
    };

    const unsubscribeFullscreen = subscribeGridPreviewFullscreenClosed(retryIfVisible);
    const unsubscribeSlot = subscribeGridPreviewSlotAvailable(retryIfVisible);

    return () => {
      unsubscribeFullscreen();
      unsubscribeSlot();
    };
  }, [autoplay, startPreview]);

  if (!autoplay) {
    return (
      <div className={className ?? "relative h-full w-full overflow-hidden bg-[#0a0b10]"}>
        {poster && !posterFailed ? (
          <img
            src={poster}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className={`select-none touch-manipulation bg-slate-900 ${imageClassName}`}
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <video
            src={src}
            muted
            playsInline
            preload="metadata"
            className={`pointer-events-none select-none ${imageClassName}`}
          />
        )}

        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
          <Play className="h-3 w-3 fill-white text-white" strokeWidth={0} aria-hidden />
        </span>
      </div>
    );
  }

  const showPoster = Boolean(poster && !posterFailed);

  return (
    <div
      ref={containerRef}
      className={className ?? "relative h-full w-full overflow-hidden bg-[#0a0b10]"}
    >
      {showPoster ? (
        <img
          src={poster ?? undefined}
          alt=""
          draggable={false}
          loading="eager"
          decoding="async"
          className={`select-none touch-manipulation bg-slate-900 transition-opacity duration-150 ${imageClassName} ${
            isPlaying ? "opacity-0" : "opacity-100"
          }`}
          onError={() => setPosterFailed(true)}
        />
      ) : null}

      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="none"
        className={`pointer-events-none absolute inset-0 select-none ${imageClassName} ${
          showPoster && !isPlaying ? "opacity-0" : "opacity-100"
        }`}
      />

      <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
        <Play className="h-3 w-3 fill-white text-white" strokeWidth={0} aria-hidden />
      </span>
    </div>
  );
}
