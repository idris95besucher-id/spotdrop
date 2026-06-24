"use client";

import { useCallback, useEffect, useState } from "react";

type KeyboardInsetState = {
  /** Pixels of layout viewport covered by the software keyboard. */
  keyboardBottom: number;
  isKeyboardOpen: boolean;
  /** Visible viewport height in px — use to shrink chat shell while keyboard is open. */
  visualViewportHeight: number | null;
};

function readKeyboardInsets(): KeyboardInsetState {
  if (typeof window === "undefined") {
    return { keyboardBottom: 0, isKeyboardOpen: false, visualViewportHeight: null };
  }

  const viewport = window.visualViewport;

  if (!viewport) {
    return { keyboardBottom: 0, isKeyboardOpen: false, visualViewportHeight: null };
  }

  const keyboardBottom = Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  );

  return {
    keyboardBottom,
    isKeyboardOpen: keyboardBottom > 0,
    visualViewportHeight: Math.round(viewport.height),
  };
}

/**
 * Tracks iOS / Capacitor software keyboard overlap via Visual Viewport API.
 * Apply `visualViewportHeight` to the chat shell while the keyboard is open so
 * the composer stays flush above the keyboard (Telegram-style).
 */
export function useKeyboardInsets() {
  const [insets, setInsets] = useState<KeyboardInsetState>(() => readKeyboardInsets());

  const sync = useCallback(() => {
    setInsets(readKeyboardInsets());
  }, []);

  useEffect(() => {
    sync();

    const viewport = window.visualViewport;

    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);

    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, [sync]);

  return insets;
}

/** Composer bottom padding: safe area only when keyboard is closed. */
export function chatComposerBottomPadding(isKeyboardOpen: boolean) {
  if (isKeyboardOpen) {
    return "0.75rem";
  }

  return "max(0.75rem, var(--sd-safe-bottom, env(safe-area-inset-bottom, 0px)))";
}

/** Messages list bottom padding when composer is in normal flex flow (not absolute). */
export const CHAT_MESSAGES_FLEX_PADDING = "pb-3";
