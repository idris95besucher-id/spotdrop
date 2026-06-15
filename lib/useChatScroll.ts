"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_THRESHOLD_PX = 120;

/** Clears space for fixed/absolute chat composer + safe area */
export const CHAT_MESSAGES_BOTTOM_PADDING =
  "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]";

type UseChatScrollOptions = {
  nearBottomThreshold?: number;
};

function scrollAfterRender(callback: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

export function useChatScroll(options: UseChatScrollOptions = {}) {
  const threshold = options.nearBottomThreshold ?? NEAR_BOTTOM_THRESHOLD_PX;
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const previousLengthRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const forceScrollRef = useRef(false);

  const getIsNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return true;
    }

    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
  }, [threshold]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    const end = messagesEndRef.current;

    if (end) {
      end.scrollIntoView({ behavior, block: "end" });
    } else if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    }

    setShowNewMessages(false);
  }, []);

  const scrollToBottomAfterRender = useCallback(
    (behavior: ScrollBehavior = "auto", retry = false) => {
      scrollAfterRender(() => {
        scrollToBottom(behavior);

        if (!retry) {
          return;
        }

        if (!getIsNearBottom()) {
          window.setTimeout(() => scrollToBottom("auto"), 64);
          window.setTimeout(() => scrollToBottom("auto"), 200);
        }
      });
    },
    [getIsNearBottom, scrollToBottom]
  );

  const markForceScroll = useCallback(() => {
    forceScrollRef.current = true;
  }, []);

  const resetChatScroll = useCallback(() => {
    previousLengthRef.current = 0;
    initialScrollDoneRef.current = false;
    forceScrollRef.current = false;
    setShowNewMessages(false);
  }, []);

  const handleScroll = useCallback(() => {
    if (getIsNearBottom()) {
      setShowNewMessages(false);
    }
  }, [getIsNearBottom]);

  const syncMessagesScroll = useCallback(
    (messageCount: number, loading: boolean) => {
      if (loading) {
        return;
      }

      if (forceScrollRef.current) {
        scrollToBottomAfterRender("smooth");
        forceScrollRef.current = false;
        previousLengthRef.current = messageCount;
        return;
      }

      if (!initialScrollDoneRef.current && messageCount > 0) {
        scrollToBottomAfterRender("auto", true);
        initialScrollDoneRef.current = true;
        previousLengthRef.current = messageCount;
        return;
      }

      if (messageCount > previousLengthRef.current) {
        if (getIsNearBottom()) {
          scrollToBottomAfterRender("smooth");
          setShowNewMessages(false);
        } else {
          setShowNewMessages(true);
        }
      }

      previousLengthRef.current = messageCount;
    },
    [getIsNearBottom, scrollToBottomAfterRender]
  );

  return {
    messagesContainerRef,
    messagesEndRef,
    showNewMessages,
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
  loading: boolean
) {
  useEffect(() => {
    syncMessagesScroll(messageCount, loading);
  }, [syncMessagesScroll, messageCount, loading]);
}
