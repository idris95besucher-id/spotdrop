"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import type { SpotCarouselSlide } from "@/lib/spotCarouselTypes";
import {
  hasSeenSpotCarouselSwipeHint,
  markSpotCarouselSwipeHintSeen,
} from "@/lib/spotCarouselHint";

/** Show numeric counter for multi-photo spots (2+ slides). */
const SPOT_CAROUSEL_COUNTER_THRESHOLD = 2;

type SpotMediaCarouselIndicatorProps = {
  slides: SpotCarouselSlide[];
  activeIndex: number;
  /** Parent positions the indicator (e.g. above user info). */
  inline?: boolean;
  /** Bottom inset inside a media card (share preview) or above fullscreen controls. */
  placement?: "compact" | "fullscreen";
  showSwipeHint?: boolean;
  onSelectIndex?: (index: number) => void;
};

export default function SpotMediaCarouselIndicator({
  slides,
  activeIndex,
  inline = false,
  placement,
  showSwipeHint = false,
  onSelectIndex,
}: SpotMediaCarouselIndicatorProps) {
  const { t } = useI18n();
  const [swipeHintVisible, setSwipeHintVisible] = useState(false);
  const showCounter = slides.length >= SPOT_CAROUSEL_COUNTER_THRESHOLD;

  useEffect(() => {
    if (!showSwipeHint || slides.length <= 1 || hasSeenSpotCarouselSwipeHint()) {
      setSwipeHintVisible(false);
      return;
    }

    setSwipeHintVisible(true);

    const timeoutId = window.setTimeout(() => {
      setSwipeHintVisible(false);
      markSpotCarouselSwipeHintSeen();
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showSwipeHint, slides.length]);

  useEffect(() => {
    if (activeIndex > 0 && swipeHintVisible) {
      setSwipeHintVisible(false);
      markSpotCarouselSwipeHintSeen();
    }
  }, [activeIndex, swipeHintVisible]);

  if (slides.length <= 1) {
    return null;
  }

  const positionClass = inline
    ? ""
    : placement === "fullscreen"
      ? "absolute inset-x-0 bottom-[max(11.5rem,calc(env(safe-area-inset-bottom)+10.25rem))] z-20"
      : placement === "compact"
        ? "absolute inset-x-0 bottom-3 z-20"
        : "";

  const content = (
    <>
      <div className="flex items-center justify-center gap-1.5">
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={`indicator-${slide.id}`}
              type="button"
              aria-label={t("spotCarousel.goToPhoto", { index: index + 1 })}
              aria-current={isActive ? "true" : undefined}
              className={`pointer-events-auto rounded-full transition-all duration-200 ${
                isActive ? "h-1.5 w-4 bg-white" : "h-1.5 w-1.5 bg-white/40"
              }`}
              onClick={() => onSelectIndex?.(index)}
            />
          );
        })}
      </div>

      {showCounter ? (
        <p className="text-[10px] font-semibold tracking-wide text-white/85">
          {activeIndex + 1}/{slides.length}
        </p>
      ) : null}

      {swipeHintVisible ? (
        <p className="text-[10px] font-medium text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          {t("spotCarousel.swipeHint")}
        </p>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <div
        className="flex flex-col items-center gap-1.5"
        role="group"
        aria-label={t("spotCarousel.indicatorLabel", { current: activeIndex + 1, total: slides.length })}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none flex flex-col items-center gap-1.5 ${positionClass}`}
      role="group"
      aria-label={t("spotCarousel.indicatorLabel", { current: activeIndex + 1, total: slides.length })}
    >
      {content}
    </div>
  );
}
