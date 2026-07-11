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

/** Distance commit for right-swipe close (~¼ screen on phones). */
export const HORIZONTAL_SWIPE_CLOSE_THRESHOLD_PX = 88;
/** Velocity commit in px/ms (~550 px/s). */
export const HORIZONTAL_SWIPE_CLOSE_VELOCITY_PX_MS = 0.55;
export const HORIZONTAL_SWIPE_CLOSE_ANIMATION_MS = 260;
/** Ignore tiny moves before axis lock. */
const AXIS_LOCK_PX = 12;
/** Horizontal must clearly dominate vertical (strong lock). */
const AXIS_DOMINANCE_RATIO = 1.4;
const VELOCITY_SAMPLE_WINDOW_MS = 100;
const VELOCITY_MAX_SAMPLES = 8;
const MIN_FLICK_DISTANCE_PX = 24;

type GestureAxis = "none" | "close";

type TouchSample = { t: number; x: number };

function isSwipeCloseBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  // Only block real controls — not media — so swipe-right works on posts.
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [role="dialog"]'
    )
  );
}

function pushTouchSample(samples: TouchSample[], x: number, t: number) {
  samples.push({ t, x });

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

  return (last.x - first.x) / dt;
}

type UseHorizontalSwipeCloseOptions = {
  onClose: () => void;
  targetRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  gestureHost?: HTMLElement | null;
};

/**
 * iOS-style interactive swipe-right-to-close for the profile post feed only.
 * Vertical scrolling never engages this gesture (strong axis lock).
 * Left swipe never closes.
 */
export function useHorizontalSwipeClose({
  onClose,
  targetRef,
  panelRef,
  enabled = true,
  gestureHost = null,
}: UseHorizontalSwipeCloseOptions) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchSamplesRef = useRef<TouchSample[]>([]);
  const axisRef = useRef<GestureAxis>("none");
  const offsetRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [offsetPx, setOffsetPx] = useState(0);
  const [panelExit, setPanelExit] = useState(false);
  const [transitionEnabled, setTransitionEnabled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const paintPanelOffset = useCallback(
    (offset: number, withTransition: boolean) => {
      const panel = panelRef.current;

      if (!panel) {
        return;
      }

      panel.style.transition = withTransition
        ? `transform ${HORIZONTAL_SWIPE_CLOSE_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
        : "none";
      panel.style.transform = `translate3d(${offset}px, 0, 0)`;
      panel.style.willChange = offset > 0 ? "transform" : "";
    },
    [panelRef]
  );

  const resetGesture = useCallback(() => {
    touchStartRef.current = null;
    touchSamplesRef.current = [];
    axisRef.current = "none";
  }, []);

  const finishClose = useCallback(() => {
    clearCloseTimer();
    isAnimatingRef.current = false;
    onCloseRef.current();
  }, [clearCloseTimer]);

  const runCloseAnimation = useCallback(() => {
    if (isAnimatingRef.current) {
      return;
    }

    isAnimatingRef.current = true;
    setIsClosing(true);
    setTransitionEnabled(true);
    setPanelExit(true);
    clearCloseTimer();

    const panel = panelRef.current;
    const width = typeof window !== "undefined" ? window.innerWidth : 400;
    paintPanelOffset(width, true);

    const complete = () => {
      if (!isAnimatingRef.current) {
        return;
      }

      finishClose();
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

    closeTimerRef.current = window.setTimeout(complete, HORIZONTAL_SWIPE_CLOSE_ANIMATION_MS + 40);
  }, [clearCloseTimer, finishClose, paintPanelOffset, panelRef]);

  const requestClose = useCallback(() => {
    if (isAnimatingRef.current || isBottomSheetScrollLocked()) {
      return;
    }

    runCloseAnimation();
  }, [runCloseAnimation]);

  const snapBack = useCallback(() => {
    setTransitionEnabled(true);
    setPanelExit(false);
    offsetRef.current = 0;
    setOffsetPx(0);
    paintPanelOffset(0, true);
  }, [paintPanelOffset]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = gestureHost ?? targetRef.current;

    if (!element) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (isAnimatingRef.current || isBottomSheetScrollLocked() || isSwipeCloseBlockedTarget(event.target)) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      clearCloseTimer();
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      touchSamplesRef.current = [{ t: performance.now(), x: touch.clientX }];
      axisRef.current = "none";
      setTransitionEnabled(false);
      setPanelExit(false);
      paintPanelOffset(offsetRef.current, false);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const start = touchStartRef.current;

      if (!start || isAnimatingRef.current || isBottomSheetScrollLocked()) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      const now = performance.now();
      pushTouchSample(touchSamplesRef.current, touch.clientX, now);

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (axisRef.current === "none") {
        if (absX < AXIS_LOCK_PX && absY < AXIS_LOCK_PX) {
          return;
        }

        // Only rightward horizontal that clearly beats vertical.
        // Left swipe and vertical scroll never lock to close.
        if (deltaX > 0 && absX >= absY * AXIS_DOMINANCE_RATIO) {
          axisRef.current = "close";
        } else {
          resetGesture();
          return;
        }
      }

      if (axisRef.current === "close") {
        // Never drag left of origin; leftward release snaps back via end handler.
        const offset = Math.max(0, deltaX);
        offsetRef.current = offset;
        paintPanelOffset(offset, false);
        event.preventDefault();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const start = touchStartRef.current;

      if (!start || isAnimatingRef.current) {
        return;
      }

      const touch = event.changedTouches[0];
      const now = performance.now();

      if (touch) {
        pushTouchSample(touchSamplesRef.current, touch.clientX, now);
      }

      const deltaX = touch ? touch.clientX - start.x : offsetRef.current;
      const deltaY = touch ? touch.clientY - start.y : 0;
      const velocityX = velocityFromSamples(touchSamplesRef.current);
      const axis = axisRef.current;

      resetGesture();

      if (axis !== "close") {
        snapBack();
        return;
      }

      const distanceCommit =
        deltaX >= HORIZONTAL_SWIPE_CLOSE_THRESHOLD_PX &&
        Math.abs(deltaX) > Math.abs(deltaY) * AXIS_DOMINANCE_RATIO;
      const velocityCommit =
        velocityX >= HORIZONTAL_SWIPE_CLOSE_VELOCITY_PX_MS &&
        deltaX >= MIN_FLICK_DISTANCE_PX;

      if (distanceCommit || velocityCommit) {
        setOffsetPx(offsetRef.current);
        runCloseAnimation();
        return;
      }

      snapBack();
    };

    const handleTouchCancel = () => {
      if (isAnimatingRef.current) {
        return;
      }

      clearCloseTimer();
      resetGesture();
      snapBack();
    };

    const moveOpts: AddEventListenerOptions = { capture: true, passive: false };
    const passiveOpts: AddEventListenerOptions = { capture: true, passive: true };

    element.addEventListener("touchstart", handleTouchStart, passiveOpts);
    element.addEventListener("touchmove", handleTouchMove, moveOpts);
    element.addEventListener("touchend", handleTouchEnd, passiveOpts);
    element.addEventListener("touchcancel", handleTouchCancel, passiveOpts);

    return () => {
      clearCloseTimer();
      element.removeEventListener("touchstart", handleTouchStart, passiveOpts);
      element.removeEventListener("touchmove", handleTouchMove, moveOpts);
      element.removeEventListener("touchend", handleTouchEnd, passiveOpts);
      element.removeEventListener("touchcancel", handleTouchCancel, passiveOpts);
    };
  }, [
    clearCloseTimer,
    enabled,
    gestureHost,
    paintPanelOffset,
    resetGesture,
    runCloseAnimation,
    snapBack,
    targetRef,
  ]);

  const panelTransform = panelExit
    ? `translate3d(100%, 0, 0)`
    : `translate3d(${offsetPx}px, 0, 0)`;

  const panelStyle: CSSProperties = {
    transform: panelTransform,
    transition: transitionEnabled
      ? `transform ${HORIZONTAL_SWIPE_CLOSE_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : "none",
    willChange: offsetPx > 0 || panelExit ? "transform" : undefined,
    height: "100%",
    width: "100%",
    touchAction: "pan-y",
  };

  const screenStyle: CSSProperties = {
    backgroundColor: offsetPx > 0 || panelExit || offsetRef.current > 0 ? "rgba(0,0,0,0.35)" : "#000",
    touchAction: "pan-y",
  };

  return {
    panelStyle,
    screenStyle,
    requestClose,
    isClosing,
  };
}
