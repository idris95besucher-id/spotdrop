"use client";

import { useEffect, useRef, useState } from "react";

type SpotPanoramaImageProps = {
  src: string;
  alt?: string;
  className?: string;
  /** Force panorama pan mode without probing. */
  forcePanorama?: boolean;
  /** Aspect ratio above this uses horizontal pan instead of cover crop. */
  panoramaAspectThreshold?: number;
  showBadge?: boolean;
  badgeLabel?: string;
  onLoad?: () => void;
  onError?: () => void;
};

/**
 * Full-bleed image that switches to object-contain + horizontal pan for wide panoramas.
 * Nested scroll prevents the parent media carousel from stealing horizontal swipes
 * while the user is panning inside a panorama.
 */
export default function SpotPanoramaImage({
  src,
  alt = "",
  className = "",
  forcePanorama = false,
  panoramaAspectThreshold = 2.05,
  showBadge = false,
  badgeLabel = "Pano",
  onLoad,
  onError,
}: SpotPanoramaImageProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [isPanorama, setIsPanorama] = useState(forcePanorama);

  useEffect(() => {
    setIsPanorama(forcePanorama);
  }, [forcePanorama, src]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${className}`}>
      {isPanorama ? (
        <div
          ref={scrollerRef}
          className="h-full w-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x",
          }}
          onTouchStart={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            decoding="async"
            className="h-full max-w-none object-contain"
            style={{ width: "auto", minWidth: "100%" }}
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                const ratio = img.naturalWidth / img.naturalHeight;
                setIsPanorama(forcePanorama || ratio >= panoramaAspectThreshold);

                // Center the panorama initially.
                requestAnimationFrame(() => {
                  const scroller = scrollerRef.current;
                  if (!scroller) return;
                  scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
                });
              }
              onLoad?.();
            }}
            onError={() => onError?.()}
          />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          className="h-full w-full object-cover"
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              const ratio = img.naturalWidth / img.naturalHeight;
              if (forcePanorama || ratio >= panoramaAspectThreshold) {
                setIsPanorama(true);
              }
            }
            onLoad?.();
          }}
          onError={() => onError?.()}
        />
      )}

      {showBadge && isPanorama ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ring-1 ring-white/15">
          {badgeLabel}
        </span>
      ) : null}
    </div>
  );
}
