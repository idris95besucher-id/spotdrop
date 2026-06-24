"use client";

import { useCallback, useRef, type RefObject } from "react";

export type DmScrollReason =
  | "message appended bottom"
  | "send bottom"
  | "keyboard bottom";

const BOTTOM_TOLERANCE_PX = 50;
const OPEN_SCROLL_DELAYS_MS = [100, 300, 600] as const;

function distanceFromBottom(container: HTMLDivElement) {
  return container.scrollHeight - container.clientHeight - container.scrollTop;
}

function forceScrollToBottom(container: HTMLDivElement) {
  container.scrollTop = container.scrollHeight;
}

function logDmOpenFinalPosition(container: HTMLDivElement) {
  const dist = distanceFromBottom(container);

  console.log("[DM OPEN] final position");
  console.log(`scrollHeight=${container.scrollHeight}`);
  console.log(`clientHeight=${container.clientHeight}`);
  console.log(`scrollTop=${container.scrollTop}`);
  console.log(`distanceFromBottom=${dist}`);

  if (container.scrollHeight === container.clientHeight && container.scrollHeight > 200) {
    console.warn(
      "[DM OPEN] scrollHeight === clientHeight — messages container is not scrollable (check min-h-0 flex chain)"
    );
  }

  return dist;
}

export function runDmOpenBottomSequence(
  containerRef: RefObject<HTMLDivElement | null>,
  onReady: () => void
): () => void {
  let cancelled = false;
  const timeoutIds: number[] = [];
  let finishAttempts = 0;

  const clearAll = () => {
    cancelled = true;
    timeoutIds.forEach((id) => window.clearTimeout(id));
    resizeObserver?.disconnect();
  };

  const container = containerRef.current;

  if (!container) {
    console.log("[DM OPEN] container missing — showing thread");
    onReady();
    return clearAll;
  }

  const force = () => {
    const current = containerRef.current;

    if (!current || cancelled) {
      return;
    }

    forceScrollToBottom(current);
  };

  let resizeObserver: ResizeObserver | null = null;

  const finish = () => {
    if (cancelled) {
      return;
    }

    const current = containerRef.current;

    if (!current) {
      onReady();
      return;
    }

    const scrollable = current.scrollHeight > current.clientHeight + 1;
    const hasMessageContent = current.childElementCount > 1;

    if (!scrollable && hasMessageContent && finishAttempts < 20) {
      finishAttempts += 1;
      force();

      const waitForLayoutId = window.setTimeout(finish, 100);
      timeoutIds.push(waitForLayoutId);
      return;
    }

    if (distanceFromBottom(current) > BOTTOM_TOLERANCE_PX) {
      force();

      const retryId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        force();

        const finalContainer = containerRef.current;

        if (finalContainer) {
          logDmOpenFinalPosition(finalContainer);
        }

        onReady();
      }, 100);

      timeoutIds.push(retryId);
      return;
    }

    logDmOpenFinalPosition(current);
    onReady();
  };

  force();

  requestAnimationFrame(() => {
    if (cancelled) {
      return;
    }

    force();
  });

  OPEN_SCROLL_DELAYS_MS.forEach((delayMs) => {
    const id = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      force();

      if (delayMs === OPEN_SCROLL_DELAYS_MS[OPEN_SCROLL_DELAYS_MS.length - 1]) {
        finish();
      }
    }, delayMs);

    timeoutIds.push(id);
  });

  resizeObserver = new ResizeObserver(() => {
    force();
  });

  resizeObserver.observe(container);

  const observerStopId = window.setTimeout(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  }, 2000);

  timeoutIds.push(observerStopId);

  return clearAll;
}

export function useDmThreadScroll() {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((reason: DmScrollReason) => {
    console.log(`[DM scroll] ${reason}`);

    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    forceScrollToBottom(container);
  }, []);

  return {
    messagesContainerRef,
    messagesEndRef,
    runDmOpenBottomSequence: useCallback(
      (onReady: () => void) => runDmOpenBottomSequence(messagesContainerRef, onReady),
      []
    ),
    scrollOnMessageAppended: useCallback(() => scrollToBottom("message appended bottom"), [scrollToBottom]),
    scrollOnSend: useCallback(() => scrollToBottom("send bottom"), [scrollToBottom]),
    scrollOnKeyboard: useCallback(() => scrollToBottom("keyboard bottom"), [scrollToBottom]),
  };
}
