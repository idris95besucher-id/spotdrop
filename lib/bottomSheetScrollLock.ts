"use client";

import { useEffect } from "react";

const BODY_ATTR = "data-bottom-sheet-open";
const VIEWPORT_SELECTOR = "[data-spot-viewer-viewport]";
const VIEWPORT_LOCKED_ATTR = "data-viewer-interaction-locked";

let lockCount = 0;
let releaseDocumentListeners: (() => void) | null = null;
let previousBodyOverscroll = "";

function isInsideBottomSheetPanel(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-bottom-sheet-panel]"));
}

function isInsideScrollableSheet(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  const scrollEl = target.closest("[data-bottom-sheet-scroll]");

  if (!(scrollEl instanceof HTMLElement)) {
    return false;
  }

  return scrollEl.scrollHeight > scrollEl.clientHeight + 1;
}

function handleDocumentTouchMove(event: TouchEvent) {
  if (lockCount <= 0) {
    return;
  }

  if (isInsideScrollableSheet(event.target)) {
    return;
  }

  if (isInsideBottomSheetPanel(event.target)) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
}

function handleDocumentWheel(event: WheelEvent) {
  if (lockCount <= 0) {
    return;
  }

  if (isInsideBottomSheetPanel(event.target)) {
    return;
  }

  event.preventDefault();
}

function applyLock() {
  document.body.setAttribute(BODY_ATTR, "true");
  previousBodyOverscroll = document.body.style.overscrollBehavior;
  document.body.style.overscrollBehavior = "none";

  document.querySelectorAll(VIEWPORT_SELECTOR).forEach((node) => {
    node.setAttribute(VIEWPORT_LOCKED_ATTR, "true");
  });

  document.addEventListener("touchmove", handleDocumentTouchMove, { passive: false, capture: true });
  document.addEventListener("wheel", handleDocumentWheel, { passive: false, capture: true });

  releaseDocumentListeners = () => {
    document.removeEventListener("touchmove", handleDocumentTouchMove, { capture: true });
    document.removeEventListener("wheel", handleDocumentWheel, { capture: true });
  };
}

function removeLock() {
  document.body.removeAttribute(BODY_ATTR);
  document.body.style.overscrollBehavior = previousBodyOverscroll;

  document.querySelectorAll(`[${VIEWPORT_LOCKED_ATTR}]`).forEach((node) => {
    node.removeAttribute(VIEWPORT_LOCKED_ATTR);
  });

  releaseDocumentListeners?.();
  releaseDocumentListeners = null;
}

function acquireLock() {
  lockCount += 1;

  if (lockCount === 1) {
    applyLock();
  }

  return () => {
    lockCount = Math.max(0, lockCount - 1);

    if (lockCount === 0) {
      removeLock();
    }
  };
}

export function isBottomSheetScrollLocked() {
  return lockCount > 0;
}

export function useBottomSheetScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    return acquireLock();
  }, [isOpen]);
}

/** Shared layout classes for mobile bottom sheets. */
export const bottomSheetLayout = {
  overlay: "fixed inset-0 z-[130] flex items-end justify-center overscroll-none sm:items-center sm:p-4",
  backdrop: "absolute inset-0 touch-none bg-black/70 backdrop-blur-sm",
  panel:
    "relative z-10 flex w-full max-w-lg min-h-0 max-h-[min(85vh,720px)] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl sm:rounded-3xl",
  scroll: "min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y",
  footer: "shrink-0 border-t border-white/10 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
} as const;
