"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_THRESHOLD_PX = 120;

/** Space for absolute room composer: p-3 + min-h-11 textarea + bottom safe area */
export const CHAT_MESSAGES_BOTTOM_PADDING =
  "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]";

type UseChatScrollOptions = {
  nearBottomThreshold?: number;
};

function scrollAfterRender(callback: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

function scrollContainerToBottom(container: HTMLDivElement, behavior: ScrollBehavior = "auto") {
  const targetTop = Math.max(0, container.scrollHeight - container.clientHeight);

  if (behavior === "auto") {
    container.scrollTop = targetTop;
    return;
  }

  try {
    container.scrollTo({ top: targetTop, behavior });
  } catch {
    container.scrollTop = targetTop;
  }
}

export function useChatScroll(options: UseChatScrollOptions = {}) {
  const threshold = options.nearBottomThreshold ?? NEAR_BOTTOM_THRESHOLD_PX;
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const [scrollRequestId, setScrollRequestId] = useState(0);
  const previousLengthRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const wasLoadingRef = useRef(true);
  const forceScrollRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeObserverTimerRef = useRef<number | null>(null);

  const stopResizeObserver = useCallback(() => {
    if (resizeObserverTimerRef.current !== null) {
      window.clearTimeout(resizeObserverTimerRef.current);
      resizeObserverTimerRef.current = null;
    }

    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
  }, []);

  const getIsNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return true;
    }

    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
  }, [threshold]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    scrollContainerToBottom(container, behavior);
    setShowNewMessages(false);
  }, []);

  const scheduleScrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto", watchResize = false) => {
      const run = () => scrollToBottom(behavior);

      scrollAfterRender(run);
      window.setTimeout(run, 0);
      window.setTimeout(run, 64);
      window.setTimeout(run, 200);
      window.setTimeout(run, 400);
      window.setTimeout(run, 600);

      if (!watchResize) {
        return;
      }

      const container = messagesContainerRef.current;
      if (!container) {
        return;
      }

      stopResizeObserver();

      const observer = new ResizeObserver(() => {
        scrollToBottom("auto");
      });

      observer.observe(container);
      resizeObserverRef.current = observer;
      resizeObserverTimerRef.current = window.setTimeout(() => {
        stopResizeObserver();
      }, 900);
    },
    [scrollToBottom, stopResizeObserver]
  );

  const markForceScroll = useCallback(() => {
    forceScrollRef.current = true;
    setScrollRequestId((current) => current + 1);
    scheduleScrollToBottom("auto", true);
  }, [scheduleScrollToBottom]);

  const resetChatScroll = useCallback(() => {
    stopResizeObserver();
    previousLengthRef.current = 0;
    initialScrollDoneRef.current = false;
    wasLoadingRef.current = true;
    forceScrollRef.current = false;
    setShowNewMessages(false);
  }, [stopResizeObserver]);

  const handleScroll = useCallback(() => {
    if (getIsNearBottom()) {
      setShowNewMessages(false);
    }
  }, [getIsNearBottom]);

  const syncMessagesScroll = useCallback(
    (messageCount: number, loading: boolean) => {
      if (loading) {
        wasLoadingRef.current = true;
        return;
      }

      const justFinishedLoading = wasLoadingRef.current;
      wasLoadingRef.current = false;

      if (forceScrollRef.current) {
        scheduleScrollToBottom("auto", true);
        forceScrollRef.current = false;
        previousLengthRef.current = messageCount;
        initialScrollDoneRef.current = true;
        return;
      }

      if (justFinishedLoading || !initialScrollDoneRef.current) {
        scheduleScrollToBottom("auto", true);
        initialScrollDoneRef.current = true;
        previousLengthRef.current = messageCount;
        return;
      }

      if (messageCount > previousLengthRef.current) {
        if (getIsNearBottom()) {
          scheduleScrollToBottom("auto", true);
          setShowNewMessages(false);
        } else {
          setShowNewMessages(true);
        }
      }

      previousLengthRef.current = messageCount;
    },
    [getIsNearBottom, scheduleScrollToBottom]
  );

  return {
    messagesContainerRef,
    messagesEndRef,
    showNewMessages,
    scrollRequestId,
    scrollToBottom,
    handleScroll,
    syncMessagesScroll,
    markForceScroll,
    resetChatScroll,
  };
}

export function useChatScrollEffect(
  syncMessagesScroll: (messageCount: number, loading: boolean) => void,
  messageCount: number,
  loading: boolean,
  scrollRequestId = 0
) {
  useEffect(() => {
    syncMessagesScroll(messageCount, loading);
  }, [syncMessagesScroll, messageCount, loading, scrollRequestId]);
}
