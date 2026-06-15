"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";

type SpotMediaPreviewPlayerProps = {
  src: string;
  poster?: string | null;
  className?: string;
  videoClassName?: string;
  trimStart?: number;
  trimEnd?: number;
  isActive?: boolean;
};

export default function SpotMediaPreviewPlayer({
  src,
  poster = null,
  className = "",
  videoClassName = "h-full w-full object-cover",
  trimStart = 0,
  trimEnd = 0,
  isActive = true,
}: SpotMediaPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    setIsReady(false);
    setIsPlaying(false);
    setLoadError(false);
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.preload = "metadata";
    video.load();
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !isActive) {
      video?.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || trimEnd <= trimStart) {
      return;
    }

    if (video.currentTime < trimStart || video.currentTime >= trimEnd - 0.03) {
      video.currentTime = trimStart;
    }
  }, [trimStart, trimEnd, src]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || trimEnd <= trimStart) {
      return;
    }

    const handleTimeUpdate = () => {
      if (video.currentTime >= trimEnd - 0.05) {
        video.currentTime = trimStart;

        if (!video.paused) {
          void video.play().catch(() => undefined);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [trimStart, trimEnd, src]);

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = true;

    if (video.paused) {
      if (trimEnd > trimStart && video.currentTime < trimStart) {
        video.currentTime = trimStart;
      }

      try {
        await video.play();
        setIsPlaying(true);
        setLoadError(false);
      } catch {
        setLoadError(true);
      }

      return;
    }

    video.pause();
    setIsPlaying(false);
  }, [trimStart, trimEnd]);

  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        key={src}
        src={src}
        poster={poster ?? undefined}
        className={videoClassName}
        playsInline
        muted
        preload="metadata"
        loop
        onLoadedMetadata={() => {
          setIsReady(true);
          setLoadError(false);

          const video = videoRef.current;

          if (video && trimEnd > trimStart && video.currentTime < trimStart) {
            video.currentTime = trimStart;
          }
        }}
        onCanPlay={() => setIsReady(true)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          const video = videoRef.current;

          if (video && trimEnd > trimStart) {
            video.currentTime = trimStart;
            void video.play().catch(() => undefined);
            return;
          }

          setIsPlaying(false);
        }}
        onError={() => {
          setLoadError(true);
          setIsReady(false);
        }}
      />

      {!isReady && !loadError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-10 w-10 animate-spin text-white/85" aria-hidden />
        </div>
      ) : null}

      {isActive ? (
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="absolute inset-0 flex items-center justify-center"
          aria-label={isPlaying ? "Pause video" : "Play video"}
        >
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white ring-2 ring-white/80 backdrop-blur-sm transition ${
              isPlaying ? "opacity-0 hover:opacity-100" : "opacity-100"
            }`}
          >
            {isPlaying ? (
              <Pause className="h-8 w-8" fill="currentColor" aria-hidden />
            ) : (
              <Play className="ml-1 h-8 w-8" fill="currentColor" aria-hidden />
            )}
          </span>
        </button>
      ) : null}

      {loadError ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-red-300">
          Tap to retry playback
        </p>
      ) : null}
    </div>
  );
}
