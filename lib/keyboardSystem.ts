/**
 * SpotDrop unified keyboard system.
 *
 * ONE source of truth for Capacitor Native resize + visualViewport overlap.
 * Every composer, bottom sheet, search field, and future TextInput must use
 * these APIs — never attach private visualViewport listeners again.
 *
 * Contract (iPhone / Capacitor):
 * - KeyboardResize.Native shrinks the WebView; do NOT also add native keyboardHeight.
 * - `keyboardBottom` is residual layout overlap only (usually 0 on Capacitor, >0 on Safari).
 * - Bottom nav hides while the keyboard is open via body[data-keyboard-open].
 */

"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/lib/mobileLayout";
import {
  getKeyboardVisibilityState,
  setChromeNavHidden,
  startKeyboardVisibilityTracking,
  subscribeKeyboardVisibility,
  type ChromeNavHideReason,
  type KeyboardVisibilityState,
} from "@/lib/keyboardVisibility";
import { useKeyboardVisibility } from "@/lib/useKeyboardVisibility";

export type {
  ChromeNavHideReason,
  KeyboardVisibilityState,
};

export {
  getKeyboardVisibilityState,
  setChromeNavHidden,
  startKeyboardVisibilityTracking,
  subscribeKeyboardVisibility,
  KEYBOARD_OPEN_BODY_ATTR,
  CHROME_NAV_HIDDEN_BODY_ATTR,
} from "@/lib/keyboardVisibility";

export { useKeyboardVisibility };

/** Preferred app-wide hook — keyboard metrics for every screen. */
export function useKeyboard() {
  return useKeyboardVisibility();
}

/** Alias kept for existing imports. */
export function useKeyboardInsets() {
  return useKeyboard();
}

export type ComposerChromeMode = "dm" | "cityRoom" | "sheet" | "fullscreen";

/**
 * Bottom padding for composers / sheet footers.
 * When the keyboard is open the shared controller hides the tab bar, so city-room
 * mode collapses to the same compact inset as DM/sheet.
 */
export function composerPaddingBottom(mode: ComposerChromeMode, isKeyboardOpen: boolean): string {
  if (isKeyboardOpen) {
    return "0.75rem";
  }

  if (mode === "cityRoom") {
    return `calc(${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + max(0.75rem, var(--sd-safe-bottom, env(safe-area-inset-bottom, 0px))))`;
  }

  return "max(0.75rem, var(--sd-safe-bottom, env(safe-area-inset-bottom, 0px)))";
}

/** @deprecated Prefer composerPaddingBottom("dm", …) */
export function chatComposerBottomPadding(isKeyboardOpen: boolean) {
  return composerPaddingBottom("dm", isKeyboardOpen);
}

/** @deprecated Prefer composerPaddingBottom("cityRoom", …) */
export function cityRoomComposerBottomPadding(isKeyboardOpen: boolean) {
  return composerPaddingBottom("cityRoom", isKeyboardOpen);
}

/** @deprecated Prefer composerPaddingBottom("dm", …) */
export function dmComposerBottomPadding(isKeyboardOpen: boolean) {
  return composerPaddingBottom("dm", isKeyboardOpen);
}

/**
 * In-flow composer lift for residual Safari overlap only.
 * Under Capacitor Native resize this stays 0 — never double-lifts.
 */
export function useComposerKeyboardStyle(): {
  isKeyboardOpen: boolean;
  keyboardBottom: number;
  composerStyle: CSSProperties;
} {
  const { isKeyboardOpen, keyboardBottom } = useKeyboard();

  const composerStyle = useMemo((): CSSProperties => {
    return {
      marginBottom: keyboardBottom > 0 ? keyboardBottom : 0,
    };
  }, [keyboardBottom]);

  return { isKeyboardOpen, keyboardBottom, composerStyle };
}

/** Alias for chat composers. */
export function useDmComposerKeyboardInset() {
  return useComposerKeyboardStyle();
}

/**
 * Anchor fixed overlays / portals to the visible viewport so they stay above
 * the keyboard and Safari chrome (Telegram/iMessage sheet behavior).
 */
export function useKeyboardViewportFrame(): {
  isKeyboardOpen: boolean;
  keyboardBottom: number;
  visualViewportHeight: number | null;
  visualViewportOffsetTop: number;
  overlayStyle: CSSProperties;
  sheetMaxHeight: string;
  footerPadding: string;
} {
  const {
    isKeyboardOpen,
    keyboardBottom,
    visualViewportHeight,
    visualViewportOffsetTop,
  } = useKeyboard();

  const overlayStyle = useMemo((): CSSProperties => {
    return {
      top: visualViewportOffsetTop,
      height: visualViewportHeight != null ? `${visualViewportHeight}px` : "100dvh",
      bottom: "auto",
    };
  }, [visualViewportHeight, visualViewportOffsetTop]);

  const sheetMaxHeight =
    visualViewportHeight != null
      ? `${Math.max(280, visualViewportHeight - 12)}px`
      : "min(85dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 12px))";

  return {
    isKeyboardOpen,
    keyboardBottom,
    visualViewportHeight,
    visualViewportOffsetTop,
    overlayStyle,
    sheetMaxHeight,
    footerPadding: composerPaddingBottom("sheet", isKeyboardOpen),
  };
}

/**
 * Hide the global bottom nav for a named reason while `active` is true.
 * Keyboard-open already hides the nav; use this for sheets/search that need
 * the nav gone even before the keyboard animates in.
 */
export function useChromeNavHidden(reason: ChromeNavHideReason, active: boolean) {
  useEffect(() => {
    if (!active) {
      setChromeNavHidden(reason, false);
      return;
    }

    setChromeNavHidden(reason, true);
    return () => setChromeNavHidden(reason, false);
  }, [reason, active]);
}

/**
 * Prevents iOS from scrolling the document when focusing inputs in chat shells.
 */
export function useKeyboardScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const lockScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    lockScroll();

    const viewport = window.visualViewport;
    viewport?.addEventListener("scroll", lockScroll);
    window.addEventListener("focusin", lockScroll);

    return () => {
      viewport?.removeEventListener("scroll", lockScroll);
      window.removeEventListener("focusin", lockScroll);
    };
  }, [enabled]);
}

/** @deprecated Prefer useKeyboardScrollLock */
export function useDmKeyboardScrollLock() {
  useKeyboardScrollLock(true);
}

/**
 * Scroll a focused field into view when the keyboard opens.
 */
export function useEnsureFocusedInputVisible(
  inputRef: { current: HTMLElement | null },
  enabled = true
) {
  const { isKeyboardOpen, visualViewportHeight } = useKeyboard();

  useEffect(() => {
    if (!enabled || !isKeyboardOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 90);

    return () => window.clearTimeout(timer);
  }, [enabled, inputRef, isKeyboardOpen, visualViewportHeight]);
}

/**
 * Messages list bottom padding when the composer is in normal flex flow.
 * Composer already occupies layout height — do not reserve composer/nav again.
 */
export const CHAT_MESSAGES_FLEX_PADDING = "pb-3";
export const CITY_ROOM_MESSAGES_FLEX_PADDING = CHAT_MESSAGES_FLEX_PADDING;
