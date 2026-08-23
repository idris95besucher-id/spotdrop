"use client";

import { useEffect, useState } from "react";
import SpotMediaCarousel from "@/components/SpotMediaCarousel";
import type { SpotCarouselSlide } from "@/lib/spotCarouselTypes";
import { fetchOfficialChannelSignedMediaUrl, type OfficialChannelPostMediaItem } from "@/lib/officialChannel";

/**
 * 1-10 photos, rendered via the same swipeable carousel + dot/counter
 * indicator ("1/5") Spots already use — SpotMediaCarousel already handles
 * scroll-snap swiping, active-index tracking, and (via
 * SpotMediaCarouselIndicator) hiding the indicator entirely for a single
 * photo, so a 1-photo post here looks identical to the legacy
 * OfficialChannelPostImage single-image rendering.
 */
export default function OfficialChannelPostCarousel({
  media,
  alt,
}: {
  media: OfficialChannelPostMediaItem[];
  alt: string;
}) {
  const [slides, setSlides] = useState<SpotCarouselSlide[] | null>(null);

  const mediaKey = media.map((item) => item.image_path).join("|");

  useEffect(() => {
    let active = true;

    void (async () => {
      const resolved = await Promise.all(
        media.map(async (item) => {
          const result = await fetchOfficialChannelSignedMediaUrl(item.image_path);
          return { imagePath: item.image_path, url: result.url };
        })
      );

      if (!active) {
        return;
      }

      setSlides(
        resolved
          .filter((entry): entry is { imagePath: string; url: string } => Boolean(entry.url))
          .map((entry) => ({
            id: entry.imagePath,
            mediaUrl: entry.url,
            mediaType: "image" as const,
          }))
      );
    })();

    return () => {
      active = false;
    };
    // Refetch only when the actual set of image paths changes (mediaKey),
    // not on every `media` array identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey]);

  if (!slides) {
    return <div className="mt-3 h-80 w-full animate-pulse rounded-2xl bg-white/5" aria-hidden />;
  }

  if (slides.length === 0) {
    return null;
  }

  return (
    <div className="relative mt-3 h-80 w-full overflow-hidden rounded-2xl" aria-label={alt}>
      <SpotMediaCarousel slides={slides} showIndicator indicatorPlacement="compact" />
    </div>
  );
}
