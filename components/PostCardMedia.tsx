"use client";

import { useEffect, useState } from "react";
import type { PostMediaFields } from "@/lib/posts";
import { getPostMedia, getPostThumbnailUrl } from "@/lib/posts";
import GridVideoPreview from "@/components/GridVideoPreview";
import GridMultiMediaFlipPreview from "@/components/GridMultiMediaFlipPreview";
import ZoomableImage from "@/components/ZoomableImage";

type PostCardMediaProps = {
  post: PostMediaFields;
  postId?: string;
  /** Enable photo→video page-flip preview for multi-media grid tiles. */
  gridPreview?: boolean;
  /** Search Explore only — muted autoplay for video grid tiles. */
  gridVideoAutoplay?: boolean;
  className?: string;
  imageClassName?: string;
  /** Shown when media fails to load or is missing — keeps grid tiles stable. */
  fallbackLabel?: string | null;
  /** Full-screen feed viewers only — enables pinch-to-zoom on plain (non-grid) photos. */
  zoomable?: boolean;
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

export default function PostCardMedia({
  post,
  postId,
  gridPreview = false,
  gridVideoAutoplay = false,
  className = "",
  imageClassName = "h-full w-full object-cover",
  fallbackLabel = null,
  zoomable = false,
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

    if (videoSrc) {
      return (
        <GridVideoPreview
          src={videoSrc}
          poster={poster}
          className={className}
          imageClassName={imageClassName}
          autoplay={gridVideoAutoplay}
        />
      );
    }

    if (poster) {
      return (
        <img
          src={poster}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className={`select-none touch-manipulation bg-slate-900 ${imageClassName} ${className}`}
          onError={() => setMediaFailed(true)}
        />
      );
    }

    return fallback;
  }

  const imageSrc = thumbnailUrl ?? mediaUrl;

  if (!imageSrc) {
    return fallback;
  }

  if (gridPreview && postId && mediaType === "image") {
    return (
      <GridMultiMediaFlipPreview
        postId={postId}
        fallbackPhotoUrl={imageSrc}
        className={className}
        imageClassName={imageClassName}
      />
    );
  }

  if (zoomable) {
    return (
      <ZoomableImage
        src={imageSrc}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        objectFit="cover"
        // Do not put Tailwind touch-* classes on the img — ZoomableImage owns touch-action
        // for iOS pinch (pan-y alone would block multi-touch in WKWebView).
        imageClassName={`${imageClassName.replace(/object-(cover|contain)/g, "")} ${className}`}
        onError={() => setMediaFailed(true)}
      />
    );
  }

  return (
    <img
      src={imageSrc}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      className={`select-none touch-manipulation ${imageClassName} ${className}`}
      onError={() => setMediaFailed(true)}
    />
  );
}
