"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  registerGridVideoPreview,
  releaseGridVideoPreview,
  tryPlayGridVideoPreview,
} from "@/lib/gridVideoPreviewControl";
import { logVideoPlaybackDebug } from "@/lib/videoPlaybackDebug";

/** Short muted preview loop length for grid tiles only (seconds). */
const GRID_VIDEO_PREVIEW_SECONDS = 3.5;

type GridVideoPreviewProps = {
  src: string;
  poster?: string | null;
  className?: string;
  imageClassName?: string;
};

/**
 * Muted inline video preview for profile/search grids.
 * Independent from full-screen PostReelMedia — separate video element per tile.
 */
export default function GridVideoPreview({
  src,
  poster,
  className,
  imageClassName = "h-full w-full object-cover",
}: GridVideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setVideoReady(false);
    setVideoFailed(false);
    setPosterFailed(false);
    setIsVisible(false);
  }, [src, poster]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    return registerGridVideoPreview(video);
  }, [src]);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;

    if (!container || !video || videoFailed) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting;
          setIsVisible(visible);

          if (visible) {
            video.preload = "auto";
            video.muted = true;

            if (tryPlayGridVideoPreview(video)) {
              void video.play().catch(() => {
                // Autoplay blocked — poster remains visible.
              });
            }
          } else {
            logVideoPlaybackDebug("grid IntersectionObserver off-screen pause", {
              src: video.currentSrc || video.src,
              currentTime: video.currentTime,
            });
            releaseGridVideoPreview(video);

            try {
              video.currentTime = 0;
            } catch {
              /* ignore */
            }
          }
        }
      },
      { threshold: 0.35, rootMargin: "24px 0px" }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [src, videoFailed]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.currentTime >= GRID_VIDEO_PREVIEW_SECONDS) {
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }

      if (isVisible && video.paused && tryPlayGridVideoPreview(video)) {
        void video.play().catch(() => undefined);
      }
    }
  }, [isVisible]);

  const posterUrl = poster?.trim() || null;
  const showPosterImage = Boolean(posterUrl && !posterFailed);
  const showLoadingPlaceholder = !videoReady && !videoFailed && !showPosterImage;
  const showVideo = !videoFailed;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 ${className ?? ""}`}
    >
      {showPosterImage ? (
        <img
          src={posterUrl!}
          alt=""
          draggable={false}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            videoReady && showVideo ? "opacity-0" : "opacity-100"
          } ${imageClassName}`}
          onError={() => setPosterFailed(true)}
        />
      ) : null}

      {showLoadingPlaceholder ? (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-700/80 via-slate-800 to-slate-900"
          aria-hidden
        />
      ) : null}

      {showVideo ? (
        <video
          ref={videoRef}
          src={src}
          poster={posterUrl ?? undefined}
          muted
          playsInline
          controls={false}
          preload={isVisible ? "auto" : "metadata"}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          data-grid-video-preview="true"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            videoReady ? "opacity-100" : "opacity-0"
          } ${imageClassName}`}
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onTimeUpdate={handleTimeUpdate}
          onError={() => setVideoFailed(true)}
        />
      ) : null}

      {videoFailed && showPosterImage ? (
        <img
          src={posterUrl!}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${imageClassName}`}
        />
      ) : null}
    </div>
  );
}
