"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SpotMediaCarouselIndicator from "@/components/SpotMediaCarouselIndicator";
import SpotPanoramaImage from "@/components/SpotPanoramaImage";
import type { SpotCarouselSlide } from "@/lib/spotCarouselTypes";

export type { SpotCarouselSlide };

/** How long to wait for `loadedmetadata` before treating a source as stuck. */
const VIDEO_SOURCE_TIMEOUT_MS = 3500;

/**
 * Video slide — mounted immediately, exactly like the photo slide, instead of
 * being gated behind a custom tap-to-play overlay.
 *
 * `slide.mediaUrl` is tried first; for a freshly-captured native video this is
 * the native `capacitor://.../_capacitor_file_...` webPath, streamed directly
 * by WKWebView from disk. That source has a known WKWebView failure mode:
 * `<video>`/`<audio>` element loads are handled by AVFoundation's own media
 * pipeline, which does not always route through an app's registered
 * `WKURLSchemeHandler` the way page-level `fetch()`/`img`/`XHR` do — so a bad
 * custom-scheme video source can simply hang (no `error` event ever fires)
 * instead of failing loudly. Relying on `error` alone to trigger the
 * `slide.fallbackMediaUrl` (`blob:`) retry therefore isn't enough — this also
 * runs a hard timeout so a source that never calls back gets treated as
 * failed and swapped out automatically. The loading/error state is rendered
 * on screen (not just logged) so a stuck source is visibly a "Loading…" or
 * "couldn't be loaded" message rather than a plain black rectangle.
 */
function CarouselVideoSlide({ slide, isActive }: { slide: SpotCarouselSlide; isActive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeSrc, setActiveSrc] = useState(slide.mediaUrl);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusDetail, setStatusDetail] = useState("starting");

  // Reset local playback state when `slide.mediaUrl` itself changes (e.g. the
  // user re-captures media into the same draft item) — adjusted during render
  // rather than in an effect, per React's guidance for state derived from
  // props. A genuinely different slide is already remounted by the parent's
  // `key={slide.id}`; this only covers the same id getting a new source.
  const [lastSeenMediaUrl, setLastSeenMediaUrl] = useState(slide.mediaUrl);
  if (slide.mediaUrl !== lastSeenMediaUrl) {
    setLastSeenMediaUrl(slide.mediaUrl);
    setActiveSrc(slide.mediaUrl);
    setStatus("loading");
    setStatusDetail("starting");
  }

  // `activeSrc` starts as `slide.mediaUrl` and only ever moves to
  // `fallbackMediaUrl` once — so "have we already tried the fallback" is
  // fully derived from whether they now differ, no separate flag needed.
  const hasFallenBackAlready = activeSrc !== slide.mediaUrl;

  const failCurrentSource = useCallback(
    (reason: string) => {
      if (!hasFallenBackAlready && slide.fallbackMediaUrl && slide.fallbackMediaUrl !== activeSrc) {
        console.warn(
          `[SpotMediaCarousel][video] ${reason} — switching to blob fallback | src=${slide.fallbackMediaUrl}`
        );
        // `key={activeSrc}` on the element below forces a clean remount on
        // the new source rather than mutating a <video> that already failed.
        setActiveSrc(slide.fallbackMediaUrl);
        setStatus("loading");
        setStatusDetail("retrying with fallback source");
        return;
      }

      console.error(
        `[SpotMediaCarousel][video] both sources failed | reason=${reason} | mediaUrl=${slide.mediaUrl} | fallbackMediaUrl=${slide.fallbackMediaUrl ?? "(none)"}`
      );
      setStatus("error");
      setStatusDetail(reason);
    },
    [activeSrc, hasFallenBackAlready, slide.fallbackMediaUrl, slide.mediaUrl]
  );

  // Belt-and-suspenders: some bad custom-scheme sources never fire `error` at
  // all, they just never call back — so also fail over on a hard timeout.
  useEffect(() => {
    if (status !== "loading") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const video = videoRef.current;

      if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
        // A frame is already showing even though `loadedmetadata` fired late
        // for some other reason — don't fail out from under a working video.
        setStatus("ready");
        return;
      }

      console.error(
        `[SpotMediaCarousel][video] timed out after ${VIDEO_SOURCE_TIMEOUT_MS}ms with no loadedmetadata | src=${activeSrc} | readyState=${video?.readyState} | networkState=${video?.networkState}`
      );
      failCurrentSource(`timed out loading (readyState=${video?.readyState ?? "?"})`);
    }, VIDEO_SOURCE_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeSrc, status, failCurrentSource]);

  const handleError = useCallback(() => {
    const video = videoRef.current;
    const mediaError = video?.error;
    const detail = `error code=${mediaError?.code ?? "?"} ${mediaError?.message ?? ""}`.trim();
    console.error(
      `[SpotMediaCarousel][video] error event | src=${activeSrc} | code=${mediaError?.code ?? "?"} | message=${mediaError?.message ?? "(none)"} | networkState=${video?.networkState} | readyState=${video?.readyState}`
    );
    failCurrentSource(detail);
  }, [activeSrc, failCurrentSource]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    console.log(
      `[SpotMediaCarousel][video] loadedmetadata | src=${activeSrc} | duration=${video?.duration} | width=${video?.videoWidth} | height=${video?.videoHeight}`
    );
    setStatus("ready");
  }, [activeSrc]);

  const handleLoadStart = useCallback(() => {
    console.log(`[SpotMediaCarousel][video] loadstart | src=${activeSrc}`);
    setStatusDetail("loading");
  }, [activeSrc]);

  const handleStalled = useCallback(() => {
    console.warn(`[SpotMediaCarousel][video] stalled | src=${activeSrc}`);
    setStatusDetail("stalled");
  }, [activeSrc]);

  const handleCanPlay = useCallback(() => {
    console.log(`[SpotMediaCarousel][video] canplay | src=${activeSrc}`);
    setStatus("ready");
  }, [activeSrc]);

  // Publishing (isActive=false, e.g. from SpotPublishScreen while an upload is in flight)
  // must not let this preview keep playing with sound in the background — pause it outright
  // rather than relying on `muted` alone, which wouldn't stop background playback/battery use.
  useEffect(() => {
    if (isActive) {
      return;
    }

    videoRef.current?.pause();
  }, [isActive]);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        key={activeSrc}
        ref={videoRef}
        src={activeSrc}
        poster={slide.posterUrl ?? undefined}
        muted={Boolean(slide.audioMuted) || !isActive}
        playsInline
        controls={isActive}
        preload="auto"
        disablePictureInPicture
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadStart={handleLoadStart}
        onStalled={handleStalled}
        onCanPlay={handleCanPlay}
        className="h-full w-full object-contain"
      />

      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
          {status === "loading" ? (
            <>
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <p className="text-xs text-white/70">Loading video…</p>
            </>
          ) : (
            <p className="px-8 text-center text-sm text-white/80">
              This video couldn&apos;t be loaded ({statusDetail}). Please record again.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

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
  /** Unused — kept for call-site compatibility. Video always plays via CarouselVideoSlide. */
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

export default function SpotMediaCarousel({
  slides,
  className = "",
  isActive = true,
  activeIndex: controlledActiveIndex,
  onActiveIndexChange,
  showIndicator = false,
  indicatorPlacement = "compact",
  showSwipeHint = false,
}: SpotMediaCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const settledIndexRef = useRef(0);

  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const [settledIndex, setSettledIndex] = useState(0);

  const activeIndex = controlledActiveIndex ?? internalActiveIndex;
  const slidesKey = slides.map((slide) => slide.id).join("|");

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

      window.setTimeout(() => {
        commitSettledIndex(clamped);
      }, PROGRAMMATIC_SCROLL_MS);
    },
    [commitSettledIndex, setActiveIndex, slides.length]
  );

  useEffect(() => {
    settledIndexRef.current = settledIndex;
  }, [settledIndex]);

  useEffect(() => {
    settledIndexRef.current = 0;
    setSettledIndex(0);
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
    setActiveIndex(controlledActiveIndex);
    commitSettledIndex(controlledActiveIndex);
  }, [commitSettledIndex, controlledActiveIndex, setActiveIndex]);

  useEffect(() => {
    const container = scrollRef.current;

    if (!container) {
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
        {slides.map((slide) => {
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
              {slide.mediaType === "video" ? (
                <CarouselVideoSlide slide={slide} isActive={isActive} />
              ) : (
                <SpotPanoramaImage
                  src={slide.mediaUrl}
                  forcePanorama={Boolean(slide.isPanorama)}
                  className="h-full w-full"
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
