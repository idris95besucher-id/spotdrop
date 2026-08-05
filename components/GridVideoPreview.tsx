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

type GridVideoPreviewProps = {
  src: string;
  poster?: string | null;
  className?: string;
  imageClassName?: string;
  /** Search Explore only — muted autoplay while visible, short loop, pause off-screen. */
  autoplay?: boolean;
};

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
  const [isPlaying, setIsPlaying] = useState(false);

  const pausePreview = useCallback(() => {
    const video = videoRef.current;
    startingRef.current = false;

    if (!video) {
      setIsPlaying(false);
      return;
    }

    releaseGridVideoPreview(video);
    setIsPlaying(false);
  }, []);

  const startPreview = useCallback(async () => {
    const video = videoRef.current;

    if (!video || !autoplay) {
      return;
    }

    if (startingRef.current) {
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

    try {
      video.currentTime = 0;
    } catch {
      /* ignore */
    }

    if (video.preload === "none") {
      video.preload = "metadata";
      video.load();
    }

    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      playBlockedUntilRef.current = Date.now() + PLAY_FAILURE_COOLDOWN_MS;
      releaseGridVideoPreview(video);
      setIsPlaying(false);
    } finally {
      startingRef.current = false;
    }
  }, [autoplay]);

  useEffect(() => {
    if (!autoplay) {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.preload = "none";
    playBlockedUntilRef.current = 0;

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
      releaseGridVideoPreview(video);
      unregister();
    };
  }, [autoplay, src]);

  useEffect(() => {
    if (!autoplay) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        isIntersectingRef.current = entry.isIntersecting;

        if (entry.isIntersecting) {
          void startPreview();
          return;
        }

        pausePreview();
      },
      { threshold: 0.35 }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      pausePreview();
    };
  }, [autoplay, pausePreview, src, startPreview]);

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
          loading="lazy"
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
