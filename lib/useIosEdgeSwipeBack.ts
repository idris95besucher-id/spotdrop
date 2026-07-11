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

export const IOS_EDGE_SWIPE_BACK_THRESHOLD_PX = 80;
export const IOS_EDGE_SWIPE_BACK_ANIMATION_MS = 220;
export const IOS_EDGE_SWIPE_BACK_EDGE_PX = 28;

const AXIS_LOCK_PX = 12;

type GestureAxis = "none" | "back";

function isBackGestureBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [data-ios-swipe-back-disabled], [role="dialog"]'
    )
  );
}

type UseIosEdgeSwipeBackOptions = {
  onBack: () => void;
  targetRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  edgeWidthPx?: number;
};

export function useIosEdgeSwipeBack({
  onBack,
  targetRef,
  panelRef,
  enabled = true,
  edgeWidthPx = IOS_EDGE_SWIPE_BACK_EDGE_PX,
}: UseIosEdgeSwipeBackOptions) {
  const touchStartRef = useRef<{ x: number; y: number; fromEdge: boolean } | null>(null);
  const axisRef = useRef<GestureAxis>("none");
  const isAnimatingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const [offsetPx, setOffsetPx] = useState(0);
  const [panelExit, setPanelExit] = useState(false);
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const resetGesture = useCallback(() => {
    touchStartRef.current = null;
    axisRef.current = "none";
  }, []);

  const finishBack = useCallback(() => {
    clearCloseTimer();
    isAnimatingRef.current = false;
    onBackRef.current();
  }, [clearCloseTimer]);

  const runBackAnimation = useCallback(() => {
    if (isAnimatingRef.current) {
      return;
    }

    isAnimatingRef.current = true;
    setTransitionEnabled(true);
    setPanelExit(true);
    clearCloseTimer();

    const panel = panelRef.current;

    const complete = () => {
      if (!isAnimatingRef.current) {
        return;
      }

      finishBack();
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

    closeTimerRef.current = window.setTimeout(complete, IOS_EDGE_SWIPE_BACK_ANIMATION_MS + 40);
  }, [clearCloseTimer, finishBack, panelRef]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = targetRef.current;

    if (!element) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (isAnimatingRef.current || isBottomSheetScrollLocked() || isBackGestureBlockedTarget(event.target)) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      const fromEdge = touch.clientX <= edgeWidthPx;

      if (!fromEdge) {
        touchStartRef.current = null;
        return;
      }

      clearCloseTimer();
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, fromEdge: true };
      axisRef.current = "none";
      setTransitionEnabled(false);
      setPanelExit(false);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const start = touchStartRef.current;

      if (!start?.fromEdge || isAnimatingRef.current || isBottomSheetScrollLocked()) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;

      if (axisRef.current === "none") {
        if (Math.abs(deltaX) < AXIS_LOCK_PX && Math.abs(deltaY) < AXIS_LOCK_PX) {
          return;
        }

        if (deltaX > 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
          axisRef.current = "back";
        } else {
          resetGesture();
          return;
        }
      }

      if (axisRef.current === "back") {
        const offset = Math.max(0, deltaX);
        setOffsetPx(offset);

        if (offset > 0) {
          event.preventDefault();
        }
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const start = touchStartRef.current;

      if (!start?.fromEdge || isAnimatingRef.current) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch ? touch.clientX - start.x : 0;
      const deltaY = touch ? touch.clientY - start.y : 0;
      const axis = axisRef.current;

      resetGesture();
      setTransitionEnabled(true);

      if (axis === "back") {
        const shouldGoBack =
          deltaX >= IOS_EDGE_SWIPE_BACK_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);

        if (shouldGoBack) {
          runBackAnimation();
          return;
        }

        setPanelExit(false);
        setOffsetPx(0);
      }
    };

    const handleTouchCancel = () => {
      if (isAnimatingRef.current) {
        return;
      }

      clearCloseTimer();
      setTransitionEnabled(true);
      setPanelExit(false);
      setOffsetPx(0);
      resetGesture();
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      clearCloseTimer();
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [clearCloseTimer, edgeWidthPx, enabled, resetGesture, runBackAnimation, targetRef]);

  const panelTransform = panelExit ? "translate3d(100%, 0, 0)" : `translate3d(${offsetPx}px, 0, 0)`;

  const panelStyle: CSSProperties = {
    transform: panelTransform,
    transition: transitionEnabled ? `transform ${IOS_EDGE_SWIPE_BACK_ANIMATION_MS}ms ease-out` : "none",
    willChange: offsetPx > 0 || panelExit ? "transform" : undefined,
  };

  return { panelStyle, isAnimating: isAnimatingRef.current };
}
