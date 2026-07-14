"use client";

import { useState } from "react";
import { Video } from "lucide-react";

type GridVideoPreviewProps = {
  src: string;
  poster?: string | null;
  className?: string;
  imageClassName?: string;
};

/**
 * Grid tile for a video post — shows the cover frame (same as a photo tile)
 * with a small video badge, exactly like Instagram/TikTok grid thumbnails.
 * No playback here; grid tiles are static, tapping opens the post.
 */
export default function GridVideoPreview({
  src,
  poster,
  className,
  imageClassName = "h-full w-full object-cover",
}: GridVideoPreviewProps) {
  const [posterFailed, setPosterFailed] = useState(false);

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
        // No cover image yet (e.g. published moments ago) — fall back to the
        // first frame of the video itself rather than an empty tile.
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          className={`pointer-events-none select-none ${imageClassName}`}
        />
      )}

      <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
        <Video className="h-3 w-3 text-white" strokeWidth={2} aria-hidden />
      </span>
    </div>
  );
}
