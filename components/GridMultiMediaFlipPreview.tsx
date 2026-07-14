"use client";

/**
 * Grid tile preview. Shows the first photo; multi-photo count or Pano badge when useful.
 */
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { loadPostMediaCarouselItems } from "@/lib/postMediaItems";

type GridMultiMediaFlipPreviewProps = {
  postId: string;
  fallbackPhotoUrl: string;
  className?: string;
  imageClassName?: string;
};

const carouselCountCache = new Map<string, number>();
const panoramaCache = new Map<string, boolean>();

export default function GridMultiMediaFlipPreview({
  postId,
  fallbackPhotoUrl,
  className = "",
  imageClassName = "h-full w-full object-cover",
}: GridMultiMediaFlipPreviewProps) {
  const [photoCount, setPhotoCount] = useState(() => carouselCountCache.get(postId) ?? 1);
  const [isPanorama, setIsPanorama] = useState(() => panoramaCache.get(fallbackPhotoUrl) ?? false);

  useEffect(() => {
    let cancelled = false;
    const cached = carouselCountCache.get(postId);

    if (cached != null) {
      setPhotoCount(cached);
      return;
    }

    void loadPostMediaCarouselItems(postId).then((items) => {
      if (cancelled) {
        return;
      }

      const count = Math.max(items.length, 1);
      carouselCountCache.set(postId, count);
      setPhotoCount(count);
    });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <img
        src={fallbackPhotoUrl}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        className={`select-none touch-manipulation ${imageClassName}`}
        onLoad={(event) => {
          const img = event.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            const wide = img.naturalWidth / img.naturalHeight >= 2.05;
            panoramaCache.set(fallbackPhotoUrl, wide);
            setIsPanorama(wide);
          }
        }}
      />

      {photoCount > 1 ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/55 text-white ring-1 ring-white/15">
          <Copy className="h-3 w-3" strokeWidth={2} aria-hidden />
        </span>
      ) : isPanorama ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white ring-1 ring-white/15">
          Pano
        </span>
      ) : null}
    </div>
  );
}
