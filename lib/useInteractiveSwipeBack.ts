"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { isBottomSheetScrollLocked } from "@/lib/bottomSheetScrollLock";

/** Completes the gesture on release once dragged at least this far, regardless of speed. */
export const SWIPE_BACK_MIN_DISTANCE_PX = 60;
/** A short flick below the distance above still completes if it moved at least this far... */
export const SWIPE_BACK_MIN_FLICK_DISTANCE_PX = 24;
/** ...and its average rightward speed (px/ms) is at least this fast. ~0.5 px/ms ≈ a quick flick. */
export const SWIPE_BACK_MIN_VELOCITY_PX_MS = 0.5;
/** Pixels of movement before the gesture commits to an axis (horizontal back vs. vertical scroll). */
const AXIS_LOCK_PX = 8;
const CANCEL_SETTLE_MS = 220;
const COMPLETE_EXIT_MS = 180;
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

type GestureAxis = "none" | "back";

/**
 * `data-swipe-back-disabled` (or explicitly `data-swipe-back-disabled="false"` to opt back in)
 * lets any element — a horizontal media carousel, an image viewer, a waveform scrubber — claim
 * a touch for its own horizontal gesture instead of the shared full-screen swipe-back below.
 */
function isBackGestureBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [role="dialog"], [data-swipe-back-disabled]:not([data-swipe-back-disabled="false"])'
    )
  );
}

type UseInteractiveSwipeBackOptions = {
  onBack: () => void;
  targetRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
};

/**
 * Shared full-screen interactive swipe-back gesture, used identically by every chat screen (DM,
 * group, city room, country room) via DmChatThreadShell / ChatThreadShell — there is exactly one
 * implementation, never a per-screen copy.
 *
 * Deliberately NOT edge-restricted: the gesture can begin anywhere on the chat screen (messages,
 * wallpaper, empty space, header, composer) — there is no `touchStartX <= edgeWidth` check. Any
 * touch that isn't over a blocked target (see isBackGestureBlockedTarget) is a candidate; once
 * its movement is clearly more horizontal than vertical, it locks into the back gesture and the
 * panel starts following the finger from that same point.
 *
 * This also means we intentionally do not use iOS's native edge-only interactive pop gesture —
 * that API only ever activates from the left edge, which can't satisfy "swipe back from
 * anywhere." This custom pan handles the whole screen, and there's no native nav stack to defer
 * to anyway: Capacitor here loads a single WKWebView running client-side Next.js routing.
 *
 * Perf/reliability note: the live drag is applied with a *direct* DOM mutation
 * (`panelRef.current.style.transform`) on every touchmove — not via React state — so the panel
 * tracks the finger at full frame rate and is immune to React re-renders elsewhere in the
 * screen (new messages arriving, typing indicators, etc.) stalling the gesture mid-drag. React
 * state is never touched during the drag itself, only the onBack callback at the very end.
 */
export function useInteractiveSwipeBack({
  onBack,
  targetRef,
  panelRef,
  enabled = true,
}: UseInteractiveSwipeBackOptions) {
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const axisRef = useRef<GestureAxis>("none");
  const isAnimatingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const resetGesture = useCallback(() => {
    touchStartRef.current = null;
    axisRef.current = "none";
  }, []);

  /** Imperative panel transform — bypasses React entirely so it never lags behind the finger. */
  const applyTransform = useCallback(
    (offsetPx: number, transitionMs: number | null) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      panel.style.transition = transitionMs === null ? "none" : `transform ${transitionMs}ms ${EASE}`;
      panel.style.transform = `translate3d(${offsetPx}px, 0, 0)`;
    },
    [panelRef]
  );

  const finishBack = useCallback(() => {
    clearSettleTimer();
    isAnimatingRef.current = false;
    onBackRef.current();
  }, [clearSettleTimer]);

  const runBackAnimation = useCallback(() => {
    if (isAnimatingRef.current) {
      return;
    }

    isAnimatingRef.current = true;
    clearSettleTimer();

    const panel = panelRef.current;
    const exitDistance = (typeof window !== "undefined" ? window.innerWidth : 400) + 40;
    applyTransform(exitDistance, COMPLETE_EXIT_MS);

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

    // Belt-and-suspenders: guarantees onBack fires exactly once even if the transitionend event
    // is ever missed (e.g. the panel gets unmounted mid-animation) — isAnimatingRef makes the
    // transitionend path and this timeout mutually exclusive, never both.
    settleTimerRef.current = window.setTimeout(complete, COMPLETE_EXIT_MS + 60);
  }, [applyTransform, clearSettleTimer, finishBack, panelRef]);

  const runCancelAnimation = useCallback(() => {
    applyTransform(0, CANCEL_SETTLE_MS);
  }, [applyTransform]);

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
        touchStartRef.current = null;
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        touchStartRef.current = null;
        return;
      }

      // No left-edge check: any touch not over a blocked target is a candidate, anywhere on
      // screen. Whether it's actually a back-swipe is decided purely by direction in
      // handleTouchMove below.
      clearSettleTimer();
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: event.timeStamp };
      axisRef.current = "none";
      // No transition while we decide the axis — the very first committed move must feel instant.
      applyTransform(0, null);
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

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;

      if (axisRef.current === "none") {
        if (Math.abs(deltaX) < AXIS_LOCK_PX && Math.abs(deltaY) < AXIS_LOCK_PX) {
          return;
        }

        if (deltaX > 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
          axisRef.current = "back";
        } else {
          // Vertical (or leftward, or ambiguous diagonal) — hand the gesture back to normal
          // scrolling immediately and never re-evaluate this touch again.
          resetGesture();
          return;
        }
      }

      // Committed to the back gesture: track the finger 1:1 from wherever it started, and stop
      // the browser's own scroll/rubber-band/selection handling from fighting it.
      applyTransform(Math.max(0, deltaX), null);
      event.preventDefault();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const start = touchStartRef.current;

      if (!start || isAnimatingRef.current) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch ? touch.clientX - start.x : 0;
      const deltaY = touch ? touch.clientY - start.y : 0;
      const elapsedMs = Math.max(1, event.timeStamp - start.t);
      const velocityPxMs = deltaX / elapsedMs;
      const axis = axisRef.current;

      resetGesture();

      if (axis !== "back") {
        return;
      }

      const mostlyHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      const shouldGoBack =
        mostlyHorizontal &&
        (deltaX >= SWIPE_BACK_MIN_DISTANCE_PX ||
          (deltaX >= SWIPE_BACK_MIN_FLICK_DISTANCE_PX && velocityPxMs >= SWIPE_BACK_MIN_VELOCITY_PX_MS));

      if (shouldGoBack) {
        runBackAnimation();
        return;
      }

      runCancelAnimation();
    };

    const handleTouchCancel = () => {
      if (isAnimatingRef.current) {
        return;
      }

      clearSettleTimer();

      if (axisRef.current === "back") {
        runCancelAnimation();
      }

      resetGesture();
    };

    // touchstart/touchend/touchcancel never need to block default behavior themselves;
    // only touchmove (once axis-locked to "back") calls preventDefault, so those three stay
    // passive for lowest possible input latency.
    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      clearSettleTimer();
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [applyTransform, clearSettleTimer, enabled, resetGesture, runBackAnimation, runCancelAnimation, targetRef]);

  // Static — the live value is owned by direct DOM mutation above, never by React state, so
  // this object's contents never change and re-renders elsewhere never clobber an in-progress
  // gesture. The box-shadow only becomes visible once the panel is actually offset from 0.
  const panelStyle: CSSProperties = {
    transform: "translate3d(0, 0, 0)",
    boxShadow: "-18px 0 36px -14px rgba(0, 0, 0, 0.5)",
    willChange: "transform",
  };

  return { panelStyle };
}
