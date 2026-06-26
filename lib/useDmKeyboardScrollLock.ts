"use client";

import { useEffect } from "react";

/**
 * Prevents iOS from scrolling the layout viewport when the keyboard opens.
 * Keeps the DM header pinned while the composer uses visualViewport bottom offset.
 */
export function useDmKeyboardScrollLock() {
  useEffect(() => {
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
  }, []);
}
