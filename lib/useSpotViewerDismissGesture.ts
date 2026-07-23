"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { isBottomSheetScrollLocked } from "@/lib/bottomSheetScrollLock";

export const SPOT_VIEWER_DISMISS_THRESHOLD_PX = 80;
export const SPOT_VIEWER_DISMISS_ANIMATION_MS = 200;

const AXIS_LOCK_PX = 8;
/** Keep recent touch samples for flick velocity (px/ms). */
const VELOCITY_SAMPLE_WINDOW_MS = 100;
const VELOCITY_MAX_SAMPLES = 8;

type GestureAxis = "none" | "dismiss" | "vertical";

export type SpotViewerCarouselGestureState = {
  itemCount: number;
  activeIndex: number;
};

type TouchSample = { t: number; y: number };

function pushTouchSample(samples: TouchSample[], y: number, t: number) {
  samples.push({ t, y });

  while (samples.length > VELOCITY_MAX_SAMPLES) {
    samples.shift();
  }

  const windowStart = t - VELOCITY_SAMPLE_WINDOW_MS;

  while (samples.length > 2 && samples[0] && samples[0].t < windowStart) {
    samples.shift();
  }
}

function velocityFromSamples(samples: TouchSample[]) {
  if (samples.length < 2) {
    return 0;
  }

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const dt = last.t - first.t;

  if (dt <= 0) {
    return 0;
  }

  return (last.y - first.y) / dt;
}

function shouldDeferHorizontalSwipeToCarousel(
  deltaX: number,
  deltaY: number,
  carousel: SpotViewerCarouselGestureState | null
) {
  if (!carousel || carousel.itemCount <= 1) {
    return false;
  }

  if (Math.abs(deltaX) < AXIS_LOCK_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
    return false;
  }

  if (deltaX > 0 && carousel.activeIndex > 0) {
    return true;
  }

  if (deltaX < 0 && carousel.activeIndex < carousel.itemCount - 1) {
    return true;
  }

  return false;
}

/** Only block horizontal dismiss starts — never block vertical paging. */
function isHorizontalDismissBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [data-spot-viewer-no-dismiss], [role="dialog"]'
    )
  );
}

function logSpotSwipe(payload: Record<string, unknown>) {
  console.log("[SpotSwipe]", payload);
}

type UseSpotViewerDismissGestureOptions = {
  onClose: () => void;
  targetRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  /** Re-bind when the target mounts (e.g. after createPortal). */
  isActive?: boolean;
  /** Extra bind key so listeners re-attach once the portal DOM node exists. */
  gestureHost?: HTMLElement | null;
  enableVerticalAxis?: boolean;
  /** Horizontal swipe-to-close. Vertical Spot viewer disables this (back button only). */
  enableHorizontalDismiss?: boolean;
  isVerticalSwipeLocked?: () => boolean;
  getCarouselGestureState?: () => SpotViewerCarouselGestureState | null;
  onVerticalDrag?: (offsetPx: number) => void;
  onVerticalDragEnd?: (deltaY: number, deltaX: number, velocityY: number) => void;
  onVerticalDragCancel?: () => void;
  /** Optional context for debug logs (activeIndex / itemCount). */
  getSwipeDebugContext?: () => { activeIndex: number; itemCount: number };
};

export function useSpotViewerDismissGesture({
  onClose,
  targetRef,
  panelRef,
  isActive = true,
  gestureHost = null,
  enableVerticalAxis = false,
  enableHorizontalDismiss = true,
  isVerticalSwipeLocked,
  getCarouselGestureState,
  onVerticalDrag,
  onVerticalDragEnd,
  onVerticalDragCancel,
  getSwipeDebugContext,
}: UseSpotViewerDismissGestureOptions) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchSamplesRef = useRef<TouchSample[]>([]);
  const axisRef = useRef<GestureAxis>("none");
  const activeGestureRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  const dismissBlockedForGestureRef = useRef(false);

  const onCloseRef = useRef(onClose);
  const enableVerticalAxisRef = useRef(enableVerticalAxis);
  const enableHorizontalDismissRef = useRef(enableHorizontalDismiss);
  const isVerticalSwipeLockedRef = useRef(isVerticalSwipeLocked);
  const getCarouselGestureStateRef = useRef(getCarouselGestureState);
  const onVerticalDragRef = useRef(onVerticalDrag);
  const onVerticalDragEndRef = useRef(onVerticalDragEnd);
  const onVerticalDragCancelRef = useRef(onVerticalDragCancel);
  const getSwipeDebugContextRef = useRef(getSwipeDebugContext);

  onCloseRef.current = onClose;
  enableVerticalAxisRef.current = enableVerticalAxis;
  enableHorizontalDismissRef.current = enableHorizontalDismiss;
  isVerticalSwipeLockedRef.current = isVerticalSwipeLocked;
  getCarouselGestureStateRef.current = getCarouselGestureState;
  onVerticalDragRef.current = onVerticalDrag;
  onVerticalDragEndRef.current = onVerticalDragEnd;
  onVerticalDragCancelRef.current = onVerticalDragCancel;
  getSwipeDebugContextRef.current = getSwipeDebugContext;

  const [dismissOffsetPx, setDismissOffsetPx] = useState(0);
  const [panelExit, setPanelExit] = useState(false);
  const [transitionEnabled, setTransitionEnabled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const resetGesture = useCallback(() => {
    touchStartRef.current = null;
    touchSamplesRef.current = [];
    axisRef.current = "none";
    activeGestureRef.current = false;
    dismissBlockedForGestureRef.current = false;
  }, []);

  const finishAnimatedClose = useCallback(() => {
    clearCloseTimer();
    onCloseRef.current();
  }, [clearCloseTimer]);

  const runCloseAnimation = useCallback(() => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    setIsClosing(true);
    setTransitionEnabled(true);
    setPanelExit(true);
    clearCloseTimer();

    const panel = panelRef.current;

    const complete = () => {
      if (!isClosingRef.current) {
        return;
      }

      finishAnimatedClose();
    };

    if (panel) {
      const onTransitionEnd = (event: TransitionEvent) => {
        if (event.target !== panel || event.propertyName !== "transform") {
          return;
        }

        panel.removeEventListener("transitionend", onTransitionEnd);
        complete();
      };

      panel.addEventListener("transitionend", onTransitionEnd);
    }

    closeTimerRef.current = window.setTimeout(complete, SPOT_VIEWER_DISMISS_ANIMATION_MS + 40);
  }, [clearCloseTimer, finishAnimatedClose, panelRef]);

  const requestClose = useCallback(() => {
    if (isClosingRef.current || isBottomSheetScrollLocked()) {
      return;
    }

    runCloseAnimation();
  }, [runCloseAnimation]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    // Prefer the live host node so portal mount cannot leave listeners unbound.
    const element = gestureHost ?? targetRef.current;

    if (!element) {
      logSpotSwipe({ event: "bind-skipped", reason: "no-host-element" });
      return;
    }

    logSpotSwipe({
      event: "bind",
      host: element.getAttribute("data-spot-viewer-screen") != null ? "screen" : element.tagName,
      enableVerticalAxis: enableVerticalAxisRef.current,
      enableHorizontalDismiss: enableHorizontalDismissRef.current,
    });

    const handleTouchStart = (event: TouchEvent) => {
      if (isClosingRef.current || isBottomSheetScrollLocked()) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      // Always record the start for vertical paging. Interactive targets only
      // block horizontal dismiss — previously this aborted the whole gesture,
      // so swipes that began on captions/buttons/video chrome never paged.
      dismissBlockedForGestureRef.current = isHorizontalDismissBlockedTarget(event.target);

      clearCloseTimer();
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      touchSamplesRef.current = [{ t: performance.now(), y: touch.clientY }];
      axisRef.current = "none";
      activeGestureRef.current = false;
      setTransitionEnabled(false);
      setPanelExit(false);

      logSpotSwipe({
        event: "start",
        startY: touch.clientY,
        startX: touch.clientX,
        target: event.target instanceof Element ? event.target.tagName : typeof event.target,
        dismissBlocked: dismissBlockedForGestureRef.current,
        ...getSwipeDebugContextRef.current?.(),
      });
    };

    const handleTouchMove = (event: TouchEvent) => {
      const start = touchStartRef.current;

      if (!start || isClosingRef.current || isBottomSheetScrollLocked()) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      const now = performance.now();
      pushTouchSample(touchSamplesRef.current, touch.clientY, now);

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Claim vertical-dominant moves immediately (before AXIS_LOCK). If we wait,
      // WKWebView rubber-bands on swipe-down and later preventDefault is ignored.
      // Skip when the gesture started on a control/link — eager preventDefault
      // cancels the synthesized click (e.g. author name → profile).
      if (
        enableVerticalAxisRef.current &&
        absY > 0 &&
        absY >= absX &&
        !isVerticalSwipeLockedRef.current?.() &&
        !dismissBlockedForGestureRef.current
      ) {
        event.preventDefault();
      }

      if (axisRef.current === "none") {
        if (absX < AXIS_LOCK_PX && absY < AXIS_LOCK_PX) {
          return;
        }

        const carousel = getCarouselGestureStateRef.current?.() ?? null;

        if (shouldDeferHorizontalSwipeToCarousel(deltaX, deltaY, carousel)) {
          logSpotSwipe({
            event: "defer-carousel",
            deltaX,
            deltaY,
            ...getSwipeDebugContextRef.current?.(),
          });
          resetGesture();
          return;
        }

        // Vertical wins whenever |dy| >= |dx| — identical for up and down.
        if (
          enableVerticalAxisRef.current &&
          absY >= AXIS_LOCK_PX &&
          absY >= absX &&
          !isVerticalSwipeLockedRef.current?.()
        ) {
          axisRef.current = "vertical";
          activeGestureRef.current = true;
          event.preventDefault();
          onVerticalDragRef.current?.(deltaY);
          logSpotSwipe({
            event: "axis-lock",
            axis: "vertical",
            startY: start.y,
            currentY: touch.clientY,
            deltaY,
            deltaX,
            ...getSwipeDebugContextRef.current?.(),
          });
          return;
        }

        if (
          enableHorizontalDismissRef.current &&
          !dismissBlockedForGestureRef.current &&
          deltaX > 0 &&
          absX > absY
        ) {
          axisRef.current = "dismiss";
          activeGestureRef.current = true;
        } else {
          return;
        }
      }

      if (axisRef.current === "dismiss") {
        const offset = Math.max(0, deltaX);
        setDismissOffsetPx(offset);

        if (offset > 0) {
          event.preventDefault();
        }

        return;
      }

      if (axisRef.current === "vertical") {
        // Critical for iOS: keep preventing default on every move so swipe-down
        // is not stolen by WKWebView rubber-banding / native scroll.
        event.preventDefault();
        onVerticalDragRef.current?.(deltaY);
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const start = touchStartRef.current;

      if (!start || isClosingRef.current) {
        return;
      }

      const touch = event.changedTouches[0];
      const now = performance.now();

      if (touch) {
        pushTouchSample(touchSamplesRef.current, touch.clientY, now);
      }

      const deltaX = touch ? touch.clientX - start.x : 0;
      const deltaY = touch ? touch.clientY - start.y : 0;
      const velocityY = velocityFromSamples(touchSamplesRef.current);
      const axis = axisRef.current;
      const debugContext = getSwipeDebugContextRef.current?.();

      resetGesture();
      setTransitionEnabled(true);

      if (axis === "dismiss") {
        const shouldClose =
          enableHorizontalDismissRef.current &&
          deltaX >= SPOT_VIEWER_DISMISS_THRESHOLD_PX &&
          Math.abs(deltaX) > Math.abs(deltaY);

        if (shouldClose) {
          runCloseAnimation();
          return;
        }

        setPanelExit(false);
        setDismissOffsetPx(0);
        return;
      }

      if (axis === "vertical") {
        logSpotSwipe({
          event: "end",
          startY: start.y,
          currentY: touch?.clientY ?? start.y,
          deltaY,
          deltaX,
          velocityY,
          axis,
          ...debugContext,
        });
        onVerticalDragEndRef.current?.(deltaY, deltaX, velocityY);
        return;
      }

      logSpotSwipe({
        event: "end-no-axis",
        startY: start.y,
        currentY: touch?.clientY ?? start.y,
        deltaY,
        deltaX,
        velocityY,
        ...debugContext,
      });
    };

    const handleTouchCancel = () => {
      if (isClosingRef.current) {
        return;
      }

      logSpotSwipe({ event: "cancel", ...getSwipeDebugContextRef.current?.() });
      clearCloseTimer();
      setTransitionEnabled(true);
      setPanelExit(false);
      setDismissOffsetPx(0);
      onVerticalDragCancelRef.current?.();
      resetGesture();
    };

    // Capture phase: run before child stopPropagation / carousel handlers.
    // touchmove MUST be non-passive so preventDefault can stop WKWebView.
    const listenerOpts: AddEventListenerOptions = { capture: true, passive: false };
    const passiveStartOpts: AddEventListenerOptions = { capture: true, passive: true };

    element.addEventListener("touchstart", handleTouchStart, passiveStartOpts);
    element.addEventListener("touchmove", handleTouchMove, listenerOpts);
    element.addEventListener("touchend", handleTouchEnd, passiveStartOpts);
    element.addEventListener("touchcancel", handleTouchCancel, passiveStartOpts);

    return () => {
      clearCloseTimer();
      element.removeEventListener("touchstart", handleTouchStart, passiveStartOpts);
      element.removeEventListener("touchmove", handleTouchMove, listenerOpts);
      element.removeEventListener("touchend", handleTouchEnd, passiveStartOpts);
      element.removeEventListener("touchcancel", handleTouchCancel, passiveStartOpts);
    };
  }, [
    clearCloseTimer,
    gestureHost,
    isActive,
    resetGesture,
    runCloseAnimation,
    targetRef,
  ]);

  const panelTransform = panelExit ? "translate3d(100%, 0, 0)" : `translate3d(${dismissOffsetPx}px, 0, 0)`;

  const panelStyle: CSSProperties = {
    transform: panelTransform,
    transition: transitionEnabled ? `transform ${SPOT_VIEWER_DISMISS_ANIMATION_MS}ms ease-out` : "none",
    height: "100%",
    width: "100%",
    willChange: dismissOffsetPx > 0 || panelExit ? "transform" : undefined,
  };

  const screenStyle: CSSProperties = {
    backgroundColor: "transparent",
    pointerEvents: isClosing ? "none" : undefined,
    // Inline touch-action so WKWebView cannot inherit pan-y from app scroll roots.
    touchAction: "none",
  };

  return {
    isClosing,
    panelStyle,
    screenStyle,
    requestClose,
    activeGestureRef,
  };
}
