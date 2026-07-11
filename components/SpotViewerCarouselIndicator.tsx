"use client";

import SpotMediaCarouselIndicator from "@/components/SpotMediaCarouselIndicator";
import type { SpotCarouselSlide } from "@/lib/spotCarouselTypes";

type SpotViewerCarouselIndicatorProps = {
  slides: SpotCarouselSlide[];
  activeIndex: number;
  showSwipeHint?: boolean;
  onSelectIndex?: (index: number) => void;
};

/** Instagram Stories-style dots above the viewer user-info block. */
export default function SpotViewerCarouselIndicator({
  slides,
  activeIndex,
  showSwipeHint = false,
  onSelectIndex,
}: SpotViewerCarouselIndicatorProps) {
  if (slides.length <= 1) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-4 w-full -translate-x-1/2">
      <SpotMediaCarouselIndicator
        slides={slides}
        activeIndex={activeIndex}
        inline
        showSwipeHint={showSwipeHint}
        onSelectIndex={onSelectIndex}
      />
    </div>
  );
}
