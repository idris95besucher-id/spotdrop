"use client";

import { useCallback, useRef } from "react";

type UseLongPressOptions = {
  onLongPress: () => void;
  delay?: number;
  disabled?: boolean;
};

export function useLongPress({ onLongPress, delay = 450, disabled = false }: UseLongPressOptions) {
  const timerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (disabled) {
      return;
    }

    longPressTriggeredRef.current = false;
    clearTimer();

    timerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;

      if ("vibrate" in navigator) {
        navigator.vibrate(10);
      }

      onLongPress();
    }, delay);
  }, [clearTimer, delay, disabled, onLongPress]);

  const cancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggeredRef.current = false;
    }
  }, []);

  return {
    longPressProps: {
      onTouchStart: start,
      onTouchEnd: cancel,
      onTouchCancel: cancel,
      onTouchMove: cancel,
      onMouseDown: start,
      onMouseUp: cancel,
      onMouseLeave: cancel,
      onContextMenu: (event: React.MouseEvent) => {
        event.preventDefault();
      },
    },
    onClickCapture,
  };
}
