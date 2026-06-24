"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PostMediaFields } from "@/lib/posts";
import { getPostMedia, getPostThumbnailUrl } from "@/lib/posts";

/** Short muted preview loop length for grid tiles (seconds). */
const GRID_VIDEO_PREVIEW_SECONDS = 3.5;

type PostCardMediaProps = {
  post: PostMediaFields;
  className?: string;
  imageClassName?: string;
  /** When true, video spots autoplay muted+looped in the grid. Default: false. */
  autoplay?: boolean;
  /** Shown when media fails to load or is missing — keeps grid tiles stable. */
  fallbackLabel?: string | null;
};

function GridMediaFallback({
  className,
  label,
}: {
  className?: string;
  label?: string | null;
}) {
  return (
    <div
      className={`flex select-none touch-manipulation items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-2 text-center text-[11px] leading-snug text-slate-400 ${className ?? ""}`}
    >
      <span className="line-clamp-4">{label ?? "Spot"}</span>
    </div>
  );
}

/**
 * Muted inline video preview for grid tiles (Search, etc.).
 * Poster/placeholder stays visible until video frames load; never shows a bare black box.
 * Plays a short ~3.5s segment when visible; pauses when scrolled away.
 */
function VideoGridPreview({
  src,
  poster,
  className,
  imageClassName = "h-full w-full object-cover",
  fallbackLabel = null,
}: {
  src: string;
  poster?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackLabel?: string | null;
}) {
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

    if (!video || videoFailed) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting;
          setIsVisible(visible);

          if (visible) {
            video.preload = "auto";
            void video.play().catch(() => {
              // Autoplay blocked — poster/placeholder remains visible.
            });
          } else {
            video.pause();
            video.currentTime = 0;
          }
        }
      },
      { threshold: 0.2, rootMargin: "40px 0px" }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [src, videoFailed]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.currentTime >= GRID_VIDEO_PREVIEW_SECONDS) {
      video.currentTime = 0;
    }
  }, []);

  const posterUrl = poster?.trim() || null;
  const showPosterImage = Boolean(posterUrl && !posterFailed);
  const showLoadingPlaceholder = !videoReady && !videoFailed && !showPosterImage;
  const showVideo = !videoFailed;

  if (videoFailed && !showPosterImage) {
    return <GridMediaFallback className={className} label={fallbackLabel} />;
  }

  return (
    <div
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
          autoPlay={isVisible}
          muted
          playsInline
          preload={isVisible ? "auto" : "metadata"}
          disablePictureInPicture
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
          className={`absolute inset-0 h-full w-full object-cover ${imageClassName}`}
        />
      ) : null}
    </div>
  );
}

export default function PostCardMedia({
  post,
  className = "",
  imageClassName = "h-full w-full object-cover",
  autoplay = false,
  fallbackLabel = null,
}: PostCardMediaProps) {
  const { mediaUrl, mediaType } = getPostMedia(post);
  const thumbnailUrl = getPostThumbnailUrl(post);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    setMediaFailed(false);
  }, [mediaUrl, thumbnailUrl, post.media_url, post.image_url, post.video_url]);

  const fallback = <GridMediaFallback className={className} label={fallbackLabel} />;

  if (mediaFailed || (!mediaUrl && !thumbnailUrl)) {
    return fallback;
  }

  if (mediaType === "video") {
    const videoSrc = mediaUrl ?? null;
    const poster = thumbnailUrl;

    if (autoplay) {
      if (videoSrc) {
        return (
          <VideoGridPreview
            src={videoSrc}
            poster={poster}
            className={className}
            imageClassName={imageClassName}
            fallbackLabel={fallbackLabel}
          />
        );
      }

      if (poster) {
        return (
          <img
            src={poster}
            alt=""
            draggable={false}
            className={`select-none touch-manipulation bg-slate-900 ${imageClassName} ${className}`}
            onError={() => setMediaFailed(true)}
          />
        );
      }

      return fallback;
    }

    if (poster) {
      return (
        <div className={`relative select-none touch-manipulation ${className}`}>
          <img src={poster} alt="" className={imageClassName} />
          <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Video
          </span>
        </div>
      );
    }

    return fallback;
  }

  const imageSrc = thumbnailUrl ?? mediaUrl;

  if (!imageSrc) {
    return fallback;
  }

  return (
    <img
      src={imageSrc}
      alt=""
      draggable={false}
      className={`select-none touch-manipulation ${imageClassName} ${className}`}
      onError={() => setMediaFailed(true)}
    />
  );
}
