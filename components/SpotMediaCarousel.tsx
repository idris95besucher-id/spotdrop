"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SpotMediaCarouselIndicator from "@/components/SpotMediaCarouselIndicator";
import type { SpotCarouselSlide } from "@/lib/spotCarouselTypes";
import { applySpotFullscreenVideoAttributes, playSpotFullscreenVideo } from "@/lib/spotViewerVideoPlayback";

export type { SpotCarouselSlide };

const VIDEO_FADE_MS = 180;
const VIDEO_PAUSE_DELAY_MS = 240;
const SCROLL_SETTLE_FALLBACK_MS = 90;
const PROGRAMMATIC_SCROLL_MS = 240;

type SpotMediaCarouselProps = {
  slides: SpotCarouselSlide[];
  className?: string;
  isActive?: boolean;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  showIndicator?: boolean;
  indicatorPlacement?: "compact" | "fullscreen";
  showSwipeHint?: boolean;
  /** Fullscreen viewer playback with publish-time audio rules. */
  viewerPlayback?: boolean;
};

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(0, index), Math.max(0, length - 1));
}

function readScrollIndex(container: HTMLDivElement, length: number) {
  const width = container.clientWidth;

  if (width <= 0) {
    return 0;
  }

  return clampIndex(Math.round(container.scrollLeft / width), length);
}

function shouldPreloadSlide(index: number, settledIndex: number, scrollIndex: number) {
  return Math.abs(index - settledIndex) <= 1 || Math.abs(index - scrollIndex) <= 1;
}

export default function SpotMediaCarousel({
  slides,
  className = "",
  isActive = true,
  activeIndex: controlledActiveIndex,
  onActiveIndexChange,
  showIndicator = false,
  indicatorPlacement = "compact",
  showSwipeHint = false,
  viewerPlayback = false,
}: SpotMediaCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const settledIndexRef = useRef(0);
  const isTouchingRef = useRef(false);

  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [settledIndex, setSettledIndex] = useState(0);
  const [videoRevealIndexes, setVideoRevealIndexes] = useState<Set<number>>(() => new Set());

  const activeIndex = controlledActiveIndex ?? internalActiveIndex;
  const slidesKey = slides.map((slide) => slide.id).join("|");

  const clearTransitionTimers = useCallback(() => {
    if (scrollSettleTimerRef.current !== null) {
      window.clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = null;
    }

    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    if (playTimerRef.current !== null) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);

  const setActiveIndex = useCallback(
    (index: number) => {
      const clamped = clampIndex(index, slides.length);

      if (controlledActiveIndex === undefined) {
        setInternalActiveIndex(clamped);
      }

      onActiveIndexChange?.(clamped);
    },
    [controlledActiveIndex, onActiveIndexChange, slides.length]
  );

  const commitSettledIndex = useCallback(
    (index: number) => {
      const clamped = clampIndex(index, slides.length);

      if (clamped === settledIndexRef.current) {
        return;
      }

      settledIndexRef.current = clamped;
      setSettledIndex(clamped);
    },
    [slides.length]
  );

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = scrollRef.current;

      if (!container) {
        return;
      }

      const clamped = clampIndex(index, slides.length);
      const width = container.clientWidth;
      container.scrollTo({ left: width * clamped, behavior: "smooth" });
      setActiveIndex(clamped);
      setScrollIndex(clamped);

      window.setTimeout(() => {
        commitSettledIndex(clamped);
      }, PROGRAMMATIC_SCROLL_MS);
    },
    [commitSettledIndex, setActiveIndex, slides.length]
  );

  const playSlideVideo = useCallback(
    async (video: HTMLVideoElement, slide: SpotCarouselSlide) => {
      if (viewerPlayback) {
        await playSpotFullscreenVideo(video, { forceMuted: Boolean(slide.audioMuted) });
        return;
      }

      video.muted = true;
      await video.play().catch(() => undefined);
    },
    [viewerPlayback]
  );

  const revealVideo = useCallback((index: number) => {
    setVideoRevealIndexes((current) => {
      if (current.has(index)) {
        return current;
      }

      const next = new Set(current);
      next.add(index);
      return next;
    });
  }, []);

  const hideVideo = useCallback((index: number) => {
    setVideoRevealIndexes((current) => {
      if (!current.has(index)) {
        return current;
      }

      const next = new Set(current);
      next.delete(index);
      return next;
    });
  }, []);

  useEffect(() => {
    settledIndexRef.current = settledIndex;
  }, [settledIndex]);

  useEffect(() => {
    settledIndexRef.current = 0;
    setSettledIndex(0);
    setScrollIndex(0);
    setVideoRevealIndexes(new Set());
  }, [slidesKey]);

  useEffect(() => {
    if (controlledActiveIndex === undefined) {
      return;
    }

    const container = scrollRef.current;

    if (!container) {
      return;
    }

    const width = container.clientWidth;

    if (width <= 0) {
      return;
    }

    container.scrollTo({ left: width * controlledActiveIndex, behavior: "auto" });
    setScrollIndex(controlledActiveIndex);

    if (!isTouchingRef.current) {
      window.requestAnimationFrame(() => {
        commitSettledIndex(controlledActiveIndex);
      });
    }
  }, [commitSettledIndex, controlledActiveIndex, slides.length]);

  useEffect(() => {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    const handleTouchStart = () => {
      isTouchingRef.current = true;
    };

    const handleTouchEnd = () => {
      isTouchingRef.current = false;
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    const container = scrollRef.current;

    if (!container || slides.length <= 1) {
      return;
    }

    const scheduleSettle = (index: number) => {
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
      }

      scrollSettleTimerRef.current = window.setTimeout(() => {
        scrollSettleTimerRef.current = null;
        commitSettledIndex(index);
      }, SCROLL_SETTLE_FALLBACK_MS);
    };

    const handleScroll = () => {
      const index = readScrollIndex(container, slides.length);
      setScrollIndex(index);
      setActiveIndex(index);
      scheduleSettle(index);
    };

    const handleScrollEnd = () => {
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
        scrollSettleTimerRef.current = null;
      }

      commitSettledIndex(readScrollIndex(container, slides.length));
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("scrollend", handleScrollEnd);

    return () => {
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
        scrollSettleTimerRef.current = null;
      }

      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [commitSettledIndex, setActiveIndex, slides.length]);

  useEffect(() => {
    if (!isActive) {
      clearTransitionTimers();
      videoRefs.current.forEach((video) => {
        if (!video) {
          return;
        }

        video.muted = true;
        video.pause();
      });
      return;
    }

    clearTransitionTimers();

    const slide = slides[settledIndex];
    const settledVideo = videoRefs.current[settledIndex];

    pauseTimerRef.current = window.setTimeout(() => {
      videoRefs.current.forEach((video, index) => {
        if (!video || index === settledIndex) {
          return;
        }

        video.pause();

        if (slides[index]?.mediaType === "video") {
          hideVideo(index);
        }
      });
    }, VIDEO_PAUSE_DELAY_MS);

    if (slide?.mediaType !== "video" || !settledVideo) {
      return () => {
        clearTransitionTimers();
      };
    }

    let cancelled = false;
    let handleLoadedData: (() => void) | null = null;

    const beginReveal = () => {
      if (!cancelled) {
        revealVideo(settledIndex);
      }
    };

    if (settledVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      beginReveal();
    } else {
      handleLoadedData = () => {
        beginReveal();
      };

      settledVideo.addEventListener("loadeddata", handleLoadedData);
    }

    playTimerRef.current = window.setTimeout(() => {
      if (!isActive || settledIndexRef.current !== settledIndex) {
        return;
      }

      const video = videoRefs.current[settledIndex];
      const currentSlide = slides[settledIndex];

      if (video && currentSlide?.mediaType === "video") {
        void playSlideVideo(video, currentSlide);
      }
    }, VIDEO_FADE_MS);

    return () => {
      cancelled = true;

      if (handleLoadedData) {
        settledVideo.removeEventListener("loadeddata", handleLoadedData);
      }

      clearTransitionTimers();
    };
  }, [
    clearTransitionTimers,
    hideVideo,
    isActive,
    playSlideVideo,
    revealVideo,
    settledIndex,
    slides,
  ]);

  useEffect(() => {
    if (!viewerPlayback || !isActive) {
      return;
    }

    const slide = slides[settledIndex];

    if (!slide || slide.mediaType !== "video") {
      return;
    }

    const video = videoRefs.current[settledIndex];

    if (!video) {
      return;
    }

    const forceMuted = Boolean(slide.audioMuted);

    if (forceMuted) {
      video.muted = true;
      return;
    }

    void playSpotFullscreenVideo(video, { forceMuted: false });
  }, [isActive, settledIndex, slides, viewerPlayback]);

  if (slides.length === 0) {
    return null;
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${className}`}>
      <div
        ref={scrollRef}
        data-spot-media-carousel
        className="spot-media-carousel-track flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x pinch-zoom",
          scrollSnapType: "x mandatory",
          scrollBehavior: "smooth",
        }}
      >
        {slides.map((slide, index) => {
          const previewMuted = viewerPlayback ? Boolean(slide.audioMuted) : true;
          const isVideo = slide.mediaType === "video";
          const isRevealed = videoRevealIndexes.has(index);
          const slideGpuStyle = {
            transform: "translate3d(0, 0, 0)",
            willChange: "transform",
            backfaceVisibility: "hidden" as const,
          };

          return (
            <div
              key={slide.id}
              className="relative h-full w-full shrink-0 grow-0 basis-full snap-center snap-always bg-black"
              style={{ ...slideGpuStyle, scrollSnapStop: "always" }}
            >
              {isVideo ? (
                <div className="relative h-full w-full bg-black">
                  {slide.posterUrl ? (
                    <img
                      src={slide.posterUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                      decoding="async"
                      style={slideGpuStyle}
                    />
                  ) : null}
                  <video
                    ref={(element) => {
                      videoRefs.current[index] = element;

                      if (element) {
                        applySpotFullscreenVideoAttributes(element);
                        element.muted = previewMuted;
                      }
                    }}
                    src={slide.mediaUrl}
                    poster={slide.posterUrl ?? undefined}
                    className="absolute inset-0 h-full w-full object-cover transition-opacity ease-out"
                    style={{
                      ...slideGpuStyle,
                      opacity: isRevealed ? 1 : 0,
                      transitionDuration: `${VIDEO_FADE_MS}ms`,
                      willChange: "transform, opacity",
                    }}
                    playsInline
                    muted={previewMuted}
                    loop
                    controls={false}
                    disablePictureInPicture
                    disableRemotePlayback
                    controlsList="nodownload nofullscreen noremoteplayback"
                    preload={shouldPreloadSlide(index, settledIndex, scrollIndex) ? "auto" : "metadata"}
                  />
                </div>
              ) : (
                <img
                  src={slide.mediaUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  decoding="async"
                  style={slideGpuStyle}
                />
              )}
            </div>
          );
        })}
      </div>

      {showIndicator && slides.length > 1 ? (
        <SpotMediaCarouselIndicator
          slides={slides}
          activeIndex={activeIndex}
          placement={indicatorPlacement}
          showSwipeHint={showSwipeHint && isActive}
          onSelectIndex={scrollToIndex}
        />
      ) : null}
    </div>
  );
}
