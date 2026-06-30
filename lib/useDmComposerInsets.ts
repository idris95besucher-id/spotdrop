"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export function readDmComposerKeyboardHeight(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const viewport = window.visualViewport;

  if (!viewport) {
    return 0;
  }

  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

type UseDmComposerPositionOptions = {
  onViewportResize?: () => void;
};

/** Positions DM composer above iOS keyboard via visualViewport bottom offset. */
export function useDmComposerPosition(options: UseDmComposerPositionOptions = {}) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [composerElement, setComposerElement] = useState<HTMLDivElement | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);
  const onViewportResizeRef = useRef(options.onViewportResize);

  useEffect(() => {
    onViewportResizeRef.current = options.onViewportResize;
  }, [options.onViewportResize]);

  const setComposerRef = useCallback((node: HTMLDivElement | null) => {
    composerRef.current = node;
    setComposerElement(node);
  }, []);

  const applyComposerBottom = useCallback(() => {
    const nextKeyboardHeight = readDmComposerKeyboardHeight();

    setKeyboardHeight(nextKeyboardHeight);

    const composer = composerRef.current;

    if (composer) {
      composer.style.bottom = `${nextKeyboardHeight}px`;
    }

    onViewportResizeRef.current?.();
  }, []);

  useLayoutEffect(() => {
    const composer = composerElement;

    if (!composer) {
      return;
    }

    const measureComposer = () => {
      setComposerHeight(Math.ceil(composer.getBoundingClientRect().height));
    };

    measureComposer();
    applyComposerBottom();

    const observer = new ResizeObserver(() => {
      measureComposer();
      applyComposerBottom();
    });

    observer.observe(composer);

    return () => {
      observer.disconnect();
    };
  }, [applyComposerBottom, composerElement]);

  useEffect(() => {
    if (!composerElement) {
      return;
    }

    applyComposerBottom();

    const viewport = window.visualViewport;

    const onViewportChange = () => {
      applyComposerBottom();
    };

    viewport?.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("scroll", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("focusin", onViewportChange);
    document.addEventListener("focusout", onViewportChange);

    return () => {
      viewport?.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      document.removeEventListener("focusin", onViewportChange);
      document.removeEventListener("focusout", onViewportChange);
    };
  }, [applyComposerBottom, composerElement]);

  const messagesPaddingBottom = composerHeight > 0 ? composerHeight + 12 : 0;

  return {
    applyComposerBottom,
    isKeyboardOpen: keyboardHeight > 0,
    messagesPaddingBottom,
    setComposerRef,
  };
}

/** DM composer only — safe-area inset + 12px above the Home Indicator (keyboard closed). */
export function dmComposerBottomPadding(isKeyboardOpen: boolean) {
  if (isKeyboardOpen) {
    return "0.75rem";
  }

  return "calc(env(safe-area-inset-bottom, 0px) + 12px)";
}
