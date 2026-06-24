"use client";

import { useEffect, useRef, useState } from "react";
import type { PostMediaFields } from "@/lib/posts";
import { getPostMedia, getPostThumbnailUrl } from "@/lib/posts";

type PostCardMediaProps = {
  post: PostMediaFields;
  className?: string;
  imageClassName?: string;
  /** When true, video spots autoplay muted+looped in the grid. Default: false. */
  autoplay?: boolean;
  /** Shown when media fails to load or is missing — keeps grid tiles stable. */
  fallbackLabel?: string | null;
};

/**
 * Muted looping inline video preview for grid tiles.
 * Uses IntersectionObserver to play only when ≥25 % of the tile is visible
 * and pause when scrolled out of view — avoids decoding many videos at once.
 */
function VideoGridPreview({
  src,
  poster,
  className,
}: {
  src: string;
  poster?: string | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            video.play().catch(() => {
              // autoplay blocked — stays on poster frame, no error shown
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster ?? undefined}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      className={className}
    />
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

  const fallback = (
    <div
      className={`flex items-center justify-center bg-slate-900 px-2 text-center text-[11px] leading-snug text-slate-400 ${className}`}
    >
      <span className="line-clamp-4">{fallbackLabel ?? "Spot"}</span>
    </div>
  );

  if (mediaFailed || (!mediaUrl && !thumbnailUrl)) {
    return fallback;
  }

  if (mediaType === "video") {
    const videoSrc = mediaUrl ?? null;
    const poster = thumbnailUrl;

    // Autoplay inline preview (search grid, profile grid, etc.)
    if (autoplay && videoSrc) {
      return (
        <div className={`relative ${className}`}>
          <VideoGridPreview
            src={videoSrc}
            poster={poster}
            className={imageClassName}
          />
        </div>
      );
    }

    // Static thumbnail + VIDEO badge (default — feed cards, DM cards, etc.)
    if (poster) {
      return (
        <div className={`relative ${className}`}>
          <img src={poster} alt="" className={imageClassName} />
          <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Video
          </span>
        </div>
      );
    }

    return <video src={mediaUrl ?? undefined} playsInline muted className={imageClassName} />;
  }

  const imageSrc = thumbnailUrl ?? mediaUrl;

  if (!imageSrc) {
    return fallback;
  }

  return (
    <img
      src={imageSrc}
      alt=""
      className={imageClassName}
      onError={() => setMediaFailed(true)}
    />
  );
}
