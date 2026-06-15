"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import PostViewerSlide from "@/components/PostViewerSlide";
import { getSafeAuthSession } from "@/lib/authSession";
import { findViewerIndexForSpot, type ViewerPostListItem } from "@/lib/postViewer";
import { isBottomSheetScrollLocked } from "@/lib/bottomSheetScrollLock";
import { getReelMediaSources, preloadReelMediaSources } from "@/lib/postViewerMedia";

type VerticalPostViewerProps = {
  items: ViewerPostListItem[];
  initialIndex: number;
  initialSpotId: string;
  initialMediaUrl?: string | null;
  onClose: () => void;
  onItemDeleted?: (postId: string) => void;
};

const OPEN_SWIPE_LOCK_MS = 600;
const CHANGE_SWIPE_LOCK_MS = 500;
const SWIPE_THRESHOLD_PX = 100;
const VERTICAL_SWIPE_START_PX = 12;

type TouchStart = {
  x: number;
  y: number;
  time: number;
};

export default function VerticalPostViewer({
  items,
  initialIndex,
  initialSpotId,
  initialMediaUrl = null,
  onClose,
  onItemDeleted,
}: VerticalPostViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const swipeLockedUntilRef = useRef(0);
  const touchStartRef = useRef<TouchStart | null>(null);
  const trackingVerticalSwipeRef = useRef(false);

  const openedIndex = useMemo(
    () => findViewerIndexForSpot(items, initialSpotId, initialMediaUrl),
    [items, initialSpotId, initialMediaUrl]
  );

  const [activeIndex, setActiveIndex] = useState(openedIndex);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [slideTransitionEnabled, setSlideTransitionEnabled] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(() => typeof document !== "undefined");

  const lockSwipes = useCallback((durationMs: number) => {
    swipeLockedUntilRef.current = Date.now() + durationMs;
  }, []);

  const isSwipeLocked = useCallback(() => Date.now() < swipeLockedUntilRef.current, []);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      setActiveIndex((current) => {
        const clamped = Math.min(Math.max(0, nextIndex), items.length - 1);

        if (clamped === current) {
          return current;
        }

        lockSwipes(CHANGE_SWIPE_LOCK_MS);
        return clamped;
      });
    },
    [items.length, lockSwipes]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const nextIndex = findViewerIndexForSpot(items, initialSpotId, initialMediaUrl);
    setActiveIndex(nextIndex);
    setDragOffsetPx(0);
    setSlideTransitionEnabled(false);
    lockSwipes(OPEN_SWIPE_LOCK_MS);
  }, [initialSpotId, initialMediaUrl, items, lockSwipes]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(Math.max(0, current), Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const previousBodyPosition = document.body.style.position;
    const previousBodyWidth = document.body.style.width;
    const previousBodyTop = document.body.style.top;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.top = `-${scrollY}px`;

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      document.body.style.position = previousBodyPosition;
      document.body.style.width = previousBodyWidth;
      document.body.style.top = previousBodyTop;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const indices = [activeIndex - 1, activeIndex, activeIndex + 1].filter(
      (index) => index >= 0 && index < items.length
    );

    for (const index of indices) {
      preloadReelMediaSources(getReelMediaSources(items[index]!));
    }
  }, [activeIndex, items]);

  const resetTouch = useCallback(() => {
    touchStartRef.current = null;
    trackingVerticalSwipeRef.current = false;
    setDragOffsetPx(0);
  }, []);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (isBottomSheetScrollLocked() || isSwipeLocked() || items.length <= 1) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      trackingVerticalSwipeRef.current = false;
      setSlideTransitionEnabled(false);
    },
    [isSwipeLocked, items.length]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;

      if (!start || isBottomSheetScrollLocked() || isSwipeLocked()) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;

      if (!trackingVerticalSwipeRef.current) {
        if (
          Math.abs(deltaY) < VERTICAL_SWIPE_START_PX ||
          Math.abs(deltaY) <= Math.abs(deltaX)
        ) {
          return;
        }

        trackingVerticalSwipeRef.current = true;
      }

      event.preventDefault();

      let offset = deltaY;

      if (activeIndex <= 0 && offset > 0) {
        offset *= 0.25;
      }

      if (activeIndex >= items.length - 1 && offset < 0) {
        offset *= 0.25;
      }

      setDragOffsetPx(offset);
    },
    [activeIndex, isSwipeLocked, items.length]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;

      if (!start) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaY = touch ? touch.clientY - start.y : 0;
      const deltaX = touch ? touch.clientX - start.x : 0;

      touchStartRef.current = null;
      trackingVerticalSwipeRef.current = false;
      setSlideTransitionEnabled(true);
      setDragOffsetPx(0);

      if (isBottomSheetScrollLocked() || isSwipeLocked()) {
        return;
      }

      const isVerticalSwipe =
        Math.abs(deltaY) >= SWIPE_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX);

      if (!isVerticalSwipe) {
        return;
      }

      if (deltaY <= -SWIPE_THRESHOLD_PX && activeIndex < items.length - 1) {
        goToIndex(activeIndex + 1);
        return;
      }

      if (deltaY >= SWIPE_THRESHOLD_PX && activeIndex > 0) {
        goToIndex(activeIndex - 1);
      }
    },
    [activeIndex, goToIndex, isSwipeLocked, items.length]
  );

  const handleTouchCancel = useCallback(() => {
    setSlideTransitionEnabled(true);
    resetTouch();
  }, [resetTouch]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const blockRubberBand = (event: TouchEvent) => {
      if (trackingVerticalSwipeRef.current) {
        event.preventDefault();
      }
    };

    viewport.addEventListener("touchmove", blockRubberBand, { passive: false });

    return () => {
      viewport.removeEventListener("touchmove", blockRubberBand);
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!mounted || items.length === 0) {
    return null;
  }

  const trackTransform = `translate3d(0, calc(${-activeIndex * 100}dvh + ${dragOffsetPx}px), 0)`;

  return createPortal(
    <div className="fixed inset-0 z-[120] overscroll-none bg-black text-white">
      <button
        type="button"
        onClick={onClose}
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/70"
        aria-label="Close viewer"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>

      <div
        ref={viewportRef}
        data-spot-viewer-viewport
        className="h-[100dvh] w-full overflow-hidden overscroll-none"
        style={{ overscrollBehavior: "none", touchAction: "pan-x pinch-zoom" }}
        role="list"
        aria-label="Posts and spots"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div
          className="flex flex-col will-change-transform"
          style={{
            transform: trackTransform,
            transition: slideTransitionEnabled ? "transform 220ms ease-out" : "none",
          }}
        >
          {items.map((spot, index) => {
            const distance = Math.abs(index - activeIndex);

            return (
              <div key={`${spot.id}-${index}`} className="h-[100dvh] w-full shrink-0">
                <PostViewerSlide
                  item={spot}
                  slideIndex={index}
                  isActive={index === activeIndex}
                  shouldPreloadMedia={distance <= 1}
                  userId={userId}
                  onItemDeleted={onItemDeleted}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
