"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PostViewerSlide from "@/components/PostViewerSlide";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { findViewerIndexForSpot, type ViewerPostListItem } from "@/lib/postViewer";
import { warmPostDetailCache } from "@/lib/postDetailCache";
import { perfMark } from "@/lib/perfLog";
import { isBottomSheetScrollLocked } from "@/lib/bottomSheetScrollLock";
import {
  cleanupReelVideoPreloads,
  getReelMediaSources,
  pauseAllPreloadedReelVideos,
  preloadReelMediaSources,
  preloadReelVideo,
  releasePreloadedReelVideo,
} from "@/lib/postViewerMedia";
import {
  notifySpotFullscreenViewerClosed,
  notifySpotFullscreenViewerOpened,
  pauseAllGridVideoPreviews,
} from "@/lib/gridVideoPreviewControl";
import { logVideoPlaybackDebug } from "@/lib/videoPlaybackDebug";
import {
  useSpotViewerDismissGesture,
  type SpotViewerCarouselGestureState,
} from "@/lib/useSpotViewerDismissGesture";
import { useHorizontalSwipeClose } from "@/lib/useHorizontalSwipeClose";
import {
  VERTICAL_POST_CHANGE_LOCK_MS,
  VERTICAL_POST_SPRING_EASING,
  VERTICAL_POST_SPRING_MS,
  applyVerticalPostEdgeResistance,
  getVerticalPostSlideOffsetPx,
  resolveVerticalPostDragEnd,
} from "@/lib/verticalPostViewerNavigation";

type VerticalPostViewerProps = {
  items: ViewerPostListItem[];
  initialIndex: number;
  initialSpotId: string;
  initialMediaUrl?: string | null;
  onClose: () => void;
  onItemDeleted?: (postId: string) => void;
  /** Search grid only — reuse profile-feed swipe-right close. */
  enableHorizontalSwipeClose?: boolean;
  /**
   * Search Spot only: hide this overlay while opening the author profile (keep it
   * mounted in memory) so back from the profile restores the same Spot.
   */
  closeBeforeAuthorProfileNavigation?: boolean;
};

const OPEN_SWIPE_LOCK_MS = 600;

function currentLocationKey() {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.pathname}${window.location.search}`;
}

/** Normalize Capacitor trailing-slash paths so /user/?id= matches /user?id=. */
function normalizeLocationKey(key: string) {
  try {
    const url = new URL(key, "https://spotdrop.local");
    let pathname = url.pathname;

    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }

    return `${pathname}${url.search}`;
  } catch {
    return key;
  }
}

function locationKeysEqual(a: string | null, b: string) {
  if (!a) {
    return false;
  }

  return normalizeLocationKey(a) === normalizeLocationKey(b);
}

function isAuthorProfileLocation(locationKey: string, authorUserId: string) {
  try {
    const url = new URL(normalizeLocationKey(locationKey), "https://spotdrop.local");
    return url.pathname === "/user" && url.searchParams.get("id") === authorUserId;
  } catch {
    return false;
  }
}

export default function VerticalPostViewer({
  items,
  initialIndex,
  initialSpotId,
  initialMediaUrl = null,
  onClose,
  onItemDeleted,
  enableHorizontalSwipeClose = false,
  closeBeforeAuthorProfileNavigation = false,
}: VerticalPostViewerProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const viewportRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [gestureHost, setGestureHost] = useState<HTMLElement | null>(null);
  const swipeLockedUntilRef = useRef(0);
  const swipeCloseClosingRef = useRef(false);
  const carouselGestureStateRef = useRef<SpotViewerCarouselGestureState | null>(null);
  const viewportHeightRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const activeIndexRef = useRef(0);
  const slideElsRef = useRef(new Map<number, HTMLDivElement>());
  const dragRafRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef<number | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const authorNavReturnPathRef = useRef<string | null>(null);
  const authorNavUserIdRef = useRef<string | null>(null);
  const authorNavHasOpenedProfileRef = useRef(false);
  const [authorProfileSuspended, setAuthorProfileSuspended] = useState(false);

  const openedIndex = useMemo(
    () => findViewerIndexForSpot(items, initialSpotId, initialMediaUrl),
    [items, initialSpotId, initialMediaUrl]
  );

  const [activeIndex, setActiveIndex] = useState(openedIndex);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [slideTransitionEnabled, setSlideTransitionEnabled] = useState(false);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [mounted, setMounted] = useState(() => typeof document !== "undefined");

  activeIndexRef.current = activeIndex;

  const lockSwipes = useCallback((durationMs: number) => {
    swipeLockedUntilRef.current = Date.now() + durationMs;
  }, []);

  const isSwipeLocked = useCallback(
    () =>
      navigationLocked ||
      Date.now() < swipeLockedUntilRef.current ||
      swipeCloseClosingRef.current,
    [navigationLocked]
  );

  const measureViewportHeight = useCallback(() => {
    const measured = viewportRef.current?.clientHeight ?? window.innerHeight;
    viewportHeightRef.current = measured > 0 ? measured : window.innerHeight;
    return viewportHeightRef.current;
  }, []);

  const clearCommitTimer = useCallback(() => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const clearDragRaf = useCallback(() => {
    if (dragRafRef.current !== null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    pendingDragOffsetRef.current = null;
  }, []);

  const paintSlideTransforms = useCallback(
    (nextActiveIndex: number, nextDragOffsetPx: number, withTransition: boolean) => {
      const viewportHeightPx = viewportHeightRef.current || measureViewportHeight();
      const transition = withTransition
        ? `transform ${VERTICAL_POST_SPRING_MS}ms ${VERTICAL_POST_SPRING_EASING}`
        : "none";

      slideElsRef.current.forEach((element, slideIndex) => {
        const offsetPx = getVerticalPostSlideOffsetPx(
          slideIndex,
          nextActiveIndex,
          nextDragOffsetPx,
          viewportHeightPx
        );
        element.style.transition = transition;
        element.style.transform = `translate3d(0, ${offsetPx}px, 0)`;
      });
    },
    [measureViewportHeight]
  );

  const finishAfterSpring = useCallback(
    (callback: () => void) => {
      clearCommitTimer();
      commitTimerRef.current = window.setTimeout(callback, VERTICAL_POST_SPRING_MS + 24);
    },
    [clearCommitTimer]
  );

  const commitSlideTransition = useCallback(
    (targetOffsetPx: number, nextIndex: number) => {
      clearDragRaf();
      setNavigationLocked(true);
      setSlideTransitionEnabled(true);
      dragOffsetRef.current = targetOffsetPx;
      setDragOffsetPx(targetOffsetPx);
      paintSlideTransforms(activeIndexRef.current, targetOffsetPx, true);
      lockSwipes(VERTICAL_POST_CHANGE_LOCK_MS);

      finishAfterSpring(() => {
        // Swap index with transition off in the same frame to avoid mid-post flicker.
        setSlideTransitionEnabled(false);
        dragOffsetRef.current = 0;
        setDragOffsetPx(0);
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        paintSlideTransforms(nextIndex, 0, false);
        setNavigationLocked(false);
      });
    },
    [clearDragRaf, finishAfterSpring, lockSwipes, paintSlideTransforms]
  );

  const snapBackToCurrent = useCallback(() => {
    clearDragRaf();
    setSlideTransitionEnabled(true);
    dragOffsetRef.current = 0;
    setDragOffsetPx(0);
    paintSlideTransforms(activeIndexRef.current, 0, true);

    finishAfterSpring(() => {
      setSlideTransitionEnabled(false);
      paintSlideTransforms(activeIndexRef.current, 0, false);
      setNavigationLocked(false);
    });
  }, [clearDragRaf, finishAfterSpring, paintSlideTransforms]);

  const handleVerticalDrag = useCallback(
    (deltaY: number) => {
      if (navigationLocked) {
        return;
      }

      const offset = applyVerticalPostEdgeResistance(
        deltaY,
        activeIndexRef.current,
        items.length
      );
      dragOffsetRef.current = offset;
      pendingDragOffsetRef.current = offset;

      if (dragRafRef.current !== null) {
        return;
      }

      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
        const nextOffset = pendingDragOffsetRef.current;

        if (nextOffset == null) {
          return;
        }

        pendingDragOffsetRef.current = null;
        paintSlideTransforms(activeIndexRef.current, nextOffset, false);
      });
    },
    [items.length, navigationLocked, paintSlideTransforms]
  );

  const handleVerticalDragEnd = useCallback(
    (deltaY: number, deltaX: number, velocityY: number) => {
      if (isBottomSheetScrollLocked() || isSwipeLocked()) {
        console.log("[SpotSwipe]", {
          event: "end-blocked",
          reason: isBottomSheetScrollLocked() ? "bottom-sheet" : "swipe-locked",
          deltaY,
          velocityY,
          activeIndex: activeIndexRef.current,
        });
        snapBackToCurrent();
        return;
      }

      const viewportHeightPx = measureViewportHeight();
      const decision = resolveVerticalPostDragEnd({
        deltaY,
        deltaX,
        velocityY,
        activeIndex: activeIndexRef.current,
        itemCount: items.length,
        viewportHeightPx,
      });

      const activeIndexNow = activeIndexRef.current;
      const targetIndex =
        decision.action === "next"
          ? activeIndexNow + 1
          : decision.action === "previous"
            ? activeIndexNow - 1
            : activeIndexNow;

      console.log("[SpotSwipe]", {
        event: "resolve",
        startY: null,
        currentY: null,
        deltaY,
        deltaX,
        velocityY,
        activeIndex: activeIndexNow,
        targetIndex,
        itemCount: items.length,
        action: decision.action,
        targetOffsetPx: "targetOffsetPx" in decision ? decision.targetOffsetPx : 0,
      });

      if (decision.action === "snap") {
        snapBackToCurrent();
        return;
      }

      if (decision.action === "next") {
        commitSlideTransition(decision.targetOffsetPx, activeIndexNow + 1);
        return;
      }

      if (decision.action === "previous") {
        commitSlideTransition(decision.targetOffsetPx, activeIndexNow - 1);
        return;
      }

      snapBackToCurrent();
    },
    [
      commitSlideTransition,
      isSwipeLocked,
      items.length,
      measureViewportHeight,
      snapBackToCurrent,
    ]
  );

  const handleVerticalDragCancel = useCallback(() => {
    if (navigationLocked) {
      return;
    }

    snapBackToCurrent();
  }, [navigationLocked, snapBackToCurrent]);

  const handleCarouselGestureStateChange = useCallback(
    (state: SpotViewerCarouselGestureState | null) => {
      carouselGestureStateRef.current = state;
    },
    []
  );

  const getCarouselGestureState = useCallback(
    () => carouselGestureStateRef.current,
    []
  );

  const getSwipeDebugContext = useCallback(
    () => ({
      activeIndex: activeIndexRef.current,
      itemCount: items.length,
    }),
    [items.length]
  );

  const setScreenNode = useCallback((node: HTMLDivElement | null) => {
    screenRef.current = node;
    setGestureHost(node);
  }, []);

  const setSlideElement = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) {
      slideElsRef.current.set(index, element);
      return;
    }

    slideElsRef.current.delete(index);
  }, []);

  const {
    isClosing: dismissIsClosing,
    panelStyle: dismissPanelStyle,
    screenStyle: dismissScreenStyle,
    requestClose: dismissRequestClose,
    activeGestureRef,
  } = useSpotViewerDismissGesture({
    onClose,
    targetRef: screenRef,
    panelRef,
    isActive: mounted && Boolean(gestureHost) && !authorProfileSuspended,
    gestureHost,
    enableVerticalAxis: true,
    enableHorizontalDismiss: false,
    isVerticalSwipeLocked: isSwipeLocked,
    getCarouselGestureState,
    getSwipeDebugContext,
    onVerticalDrag: handleVerticalDrag,
    onVerticalDragEnd: handleVerticalDragEnd,
    onVerticalDragCancel: handleVerticalDragCancel,
  });

  const {
    isClosing: swipeCloseIsClosing,
    panelStyle: swipeClosePanelStyle,
    screenStyle: swipeCloseScreenStyle,
    requestClose: swipeCloseRequestClose,
  } = useHorizontalSwipeClose({
    onClose,
    targetRef: screenRef,
    panelRef,
    enabled: enableHorizontalSwipeClose && mounted && Boolean(gestureHost) && !authorProfileSuspended,
    gestureHost,
  });

  const suspendForAuthorProfileNavigation = useCallback((authorUserId: string) => {
    if (!closeBeforeAuthorProfileNavigation || authorProfileSuspended) {
      return;
    }

    authorNavReturnPathRef.current = currentLocationKey();
    authorNavUserIdRef.current = authorUserId;
    authorNavHasOpenedProfileRef.current = false;
    setAuthorProfileSuspended(true);
    pauseAllPreloadedReelVideos();
    notifySpotFullscreenViewerClosed();
  }, [authorProfileSuspended, closeBeforeAuthorProfileNavigation]);

  // Search → Spot → author profile: keep this Spot mounted (hidden). Resume when
  // back navigation returns to the Search path; discard if the user leaves elsewhere.
  useEffect(() => {
    if (!authorProfileSuspended) {
      return;
    }

    const current = currentLocationKey();
    const returnPath = authorNavReturnPathRef.current;
    const authorUserId = authorNavUserIdRef.current;

    if (authorUserId && isAuthorProfileLocation(current, authorUserId)) {
      authorNavHasOpenedProfileRef.current = true;
      return;
    }

    if (locationKeysEqual(returnPath, current)) {
      // Still on Search before router.push commits — do not resume yet.
      if (!authorNavHasOpenedProfileRef.current) {
        return;
      }

      setAuthorProfileSuspended(false);
      authorNavReturnPathRef.current = null;
      authorNavUserIdRef.current = null;
      authorNavHasOpenedProfileRef.current = false;
      pauseAllGridVideoPreviews();
      pauseAllPreloadedReelVideos();
      notifySpotFullscreenViewerOpened();
      return;
    }

    // Left the author profile without returning to Search — drop the suspended Spot.
    if (!authorNavHasOpenedProfileRef.current) {
      return;
    }

    authorNavReturnPathRef.current = null;
    authorNavUserIdRef.current = null;
    authorNavHasOpenedProfileRef.current = false;
    onClose();
  }, [authorProfileSuspended, onClose, pathname]);

  const isClosing = enableHorizontalSwipeClose ? swipeCloseIsClosing : dismissIsClosing;
  const requestClose = enableHorizontalSwipeClose ? swipeCloseRequestClose : dismissRequestClose;
  // Omit React transform when reusing swipe-close: the hook paints translate via the DOM
  // so vertical-pager re-renders cannot reset finger-follow mid-gesture.
  const panelStyle = enableHorizontalSwipeClose
    ? {
        height: "100%",
        width: "100%",
        touchAction: "none" as const,
        willChange: swipeCloseIsClosing ? ("transform" as const) : swipeClosePanelStyle.willChange,
      }
    : dismissPanelStyle;
  const screenStyle = enableHorizontalSwipeClose
    ? {
        backgroundColor: swipeCloseScreenStyle.backgroundColor ?? "#000",
        touchAction: "none" as const,
        pointerEvents: swipeCloseIsClosing ? ("none" as const) : undefined,
      }
    : dismissScreenStyle;

  swipeCloseClosingRef.current = enableHorizontalSwipeClose && swipeCloseIsClosing;

  useEffect(() => {
    setMounted(true);
    logVideoPlaybackDebug("VerticalPostViewer mount", {
      initialSpotId,
      initialIndex: openedIndex,
      itemCount: items.length,
    });
    notifySpotFullscreenViewerOpened();
    pauseAllGridVideoPreviews();
    pauseAllPreloadedReelVideos();

    return () => {
      clearCommitTimer();
      clearDragRaf();
      notifySpotFullscreenViewerClosed();
    };
  }, [clearCommitTimer, clearDragRaf, initialSpotId, items.length, openedIndex]);

  useEffect(() => {
    const nextIndex = findViewerIndexForSpot(items, initialSpotId, initialMediaUrl);
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    dragOffsetRef.current = 0;
    setDragOffsetPx(0);
    setSlideTransitionEnabled(false);
    setNavigationLocked(false);
    lockSwipes(OPEN_SWIPE_LOCK_MS);
  }, [initialSpotId, initialMediaUrl, items, lockSwipes]);

  useEffect(() => {
    setActiveIndex((current) => {
      const next = Math.min(Math.max(0, current), Math.max(0, items.length - 1));
      activeIndexRef.current = next;
      return next;
    });
  }, [items.length]);

  useLayoutEffect(() => {
    measureViewportHeight();
    paintSlideTransforms(activeIndex, dragOffsetRef.current, slideTransitionEnabled);
  }, [activeIndex, dragOffsetPx, items.length, measureViewportHeight, paintSlideTransforms, slideTransitionEnabled]);

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

  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    perfMark("spot-viewer");
  }, []);

  useEffect(() => {
    const handleResize = () => {
      measureViewportHeight();
      paintSlideTransforms(activeIndexRef.current, dragOffsetRef.current, false);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measureViewportHeight, paintSlideTransforms]);

  useEffect(() => {
    const keepVideoUrls = new Set<string>();

    for (const index of [activeIndex - 1, activeIndex, activeIndex + 1]) {
      if (index < 0 || index >= items.length) {
        continue;
      }

      const spot = items[index]!;
      const sources = getReelMediaSources(spot);

      preloadReelMediaSources(sources);
      warmPostDetailCache(spot.id);

      if (sources.mediaType === "video" && sources.mediaUrl) {
        if (index === activeIndex) {
          releasePreloadedReelVideo(sources.mediaUrl);
        } else {
          preloadReelVideo(sources.mediaUrl, "metadata");
          keepVideoUrls.add(sources.mediaUrl);
        }
      }
    }

    const nextSpot = items[activeIndex + 1];

    if (nextSpot) {
      const nextSources = getReelMediaSources(nextSpot);

      if (nextSources.mediaType === "video" && nextSources.mediaUrl) {
        preloadReelVideo(nextSources.mediaUrl, "metadata");
        keepVideoUrls.add(nextSources.mediaUrl);
      }
    }

    cleanupReelVideoPreloads(keepVideoUrls);

    return () => {
      cleanupReelVideoPreloads(new Set());
      pauseAllPreloadedReelVideos();
    };
  }, [activeIndex, items]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const blockRubberBand = (event: TouchEvent) => {
      if (activeGestureRef.current) {
        event.preventDefault();
      }
    };

    viewport.addEventListener("touchmove", blockRubberBand, { passive: false });

    return () => {
      viewport.removeEventListener("touchmove", blockRubberBand);
    };
  }, [activeGestureRef]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
      }
    },
    [requestClose]
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

  const viewportHeightPx =
    viewportHeightRef.current || (typeof window !== "undefined" ? window.innerHeight : 800);
  // Prefer the live ref so incidental re-renders during a drag do not snap back.
  const liveDragOffsetPx = dragOffsetRef.current;

  return createPortal(
    <div
      ref={setScreenNode}
      data-spot-viewer-screen
      data-search-reel-viewer={enableHorizontalSwipeClose ? "" : undefined}
      data-spot-viewer-closing={isClosing ? "" : undefined}
      data-spot-viewer-author-suspended={authorProfileSuspended ? "" : undefined}
      hidden={authorProfileSuspended}
      className="fixed inset-0 z-[120] overscroll-none text-white"
      style={{
        ...screenStyle,
        ...(authorProfileSuspended ? { display: "none" } : null),
      }}
      aria-hidden={authorProfileSuspended || undefined}
    >
      <div ref={panelRef} data-spot-viewer-panel style={panelStyle}>
        <button
          type="button"
          onClick={requestClose}
          className="absolute left-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/70"
          data-spot-viewer-chrome-top
          aria-label={t("post.goBack")}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>

        <div
          ref={viewportRef}
          data-spot-viewer-viewport
          className="relative h-full w-full overflow-hidden overscroll-none"
          style={{ overscrollBehavior: "none", touchAction: "none" }}
          role="list"
          aria-label="Posts and spots"
        >
          {items.map((spot, index) => {
            const distance = Math.abs(index - activeIndex);

            if (distance > 1) {
              return null;
            }

            const offsetPx = getVerticalPostSlideOffsetPx(
              index,
              activeIndex,
              liveDragOffsetPx,
              viewportHeightPx
            );

            return (
              <div
                key={spot.id}
                ref={(element) => setSlideElement(index, element)}
                className="absolute inset-0 h-full w-full will-change-transform"
                style={{
                  transform: `translate3d(0, ${offsetPx}px, 0)`,
                  transition: slideTransitionEnabled
                    ? `transform ${VERTICAL_POST_SPRING_MS}ms ${VERTICAL_POST_SPRING_EASING}`
                    : "none",
                  zIndex: index === activeIndex ? 2 : 1,
                }}
              >
                <PostViewerSlide
                  item={spot}
                  slideIndex={index}
                  isActive={index === activeIndex && !authorProfileSuspended}
                  shouldPreloadMedia={distance <= 1}
                  userId={userId}
                  onItemDeleted={onItemDeleted}
                  onCarouselGestureStateChange={handleCarouselGestureStateChange}
                  closeBeforeAuthorProfileNavigation={closeBeforeAuthorProfileNavigation}
                  onSuspendForAuthorProfileNavigation={suspendForAuthorProfileNavigation}
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
