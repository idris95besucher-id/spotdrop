"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ensureTextareaCaretVisible } from "@/lib/ensureTextareaCaretVisible";

export const SPOT_LOCATION_CARD_KEYBOARD_TRANSITION_MS = 280;
export const SPOT_LOCATION_CARD_KEYBOARD_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

type UseSpotLocationCardEditorKeyboardOptions = {
  isEditing: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  headerRef: RefObject<HTMLElement | null>;
  toolsRef: RefObject<HTMLElement | null>;
  cardRef: RefObject<HTMLElement | null>;
};

type ViewportState = {
  keyboardBottom: number;
  viewportHeight: number | null;
  viewportOffsetTop: number;
};

function readViewportState(): ViewportState {
  if (typeof window === "undefined") {
    return { keyboardBottom: 0, viewportHeight: null, viewportOffsetTop: 0 };
  }

  const viewport = window.visualViewport;

  if (!viewport) {
    return {
      keyboardBottom: 0,
      viewportHeight: window.innerHeight,
      viewportOffsetTop: 0,
    };
  }

  return {
    keyboardBottom: Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)),
    viewportHeight: Math.round(viewport.height),
    viewportOffsetTop: Math.round(viewport.offsetTop),
  };
}

function measureElementHeight(element: HTMLElement | null) {
  if (!element) {
    return 0;
  }

  return Math.ceil(element.getBoundingClientRect().height);
}

export function useSpotLocationCardEditorKeyboard({
  isEditing,
  textareaRef,
  headerRef,
  toolsRef,
  cardRef,
}: UseSpotLocationCardEditorKeyboardOptions) {
  const [viewportState, setViewportState] = useState<ViewportState>(() => readViewportState());
  const [headerHeight, setHeaderHeight] = useState(0);
  const [toolsHeight, setToolsHeight] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  const caretSyncFrameRef = useRef<number | null>(null);

  const syncViewport = useCallback(() => {
    setViewportState(readViewportState());
  }, []);

  const measureLayout = useCallback(() => {
    setHeaderHeight(measureElementHeight(headerRef.current));
    setToolsHeight(measureElementHeight(toolsRef.current));
    setCardWidth(cardRef.current?.offsetWidth ?? 0);
  }, [cardRef, headerRef, toolsRef]);

  const syncCaretIntoView = useCallback(() => {
    const textarea = textareaRef.current;

    if (!textarea || !isEditing) {
      return;
    }

    ensureTextareaCaretVisible(textarea);

    const rect = textarea.getBoundingClientRect();
    const viewport = window.visualViewport;
    const visibleBottom = viewport
      ? viewport.offsetTop + viewport.height
      : window.innerHeight;
    const visibleTop = viewport?.offsetTop ?? 0;
    const margin = 12;

    if (rect.bottom > visibleBottom - margin || rect.top < visibleTop + margin) {
      textarea.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      ensureTextareaCaretVisible(textarea);
    }
  }, [isEditing, textareaRef]);

  const scheduleCaretSync = useCallback(() => {
    if (caretSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(caretSyncFrameRef.current);
    }

    caretSyncFrameRef.current = window.requestAnimationFrame(() => {
      caretSyncFrameRef.current = null;
      syncCaretIntoView();
    });
  }, [syncCaretIntoView]);

  useLayoutEffect(() => {
    measureLayout();
  }, [measureLayout, isEditing, viewportState.keyboardBottom, viewportState.viewportHeight]);

  useEffect(() => {
    syncViewport();
    measureLayout();

    const viewport = window.visualViewport;

    const onViewportChange = () => {
      syncViewport();
      measureLayout();
      scheduleCaretSync();
    };

    viewport?.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("scroll", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("focusin", onViewportChange);
    document.addEventListener("focusout", onViewportChange);

    const observers: ResizeObserver[] = [];

    for (const ref of [headerRef, toolsRef, cardRef]) {
      const element = ref.current;

      if (!element) {
        continue;
      }

      const observer = new ResizeObserver(() => {
        measureLayout();
        scheduleCaretSync();
      });

      observer.observe(element);
      observers.push(observer);
    }

    return () => {
      viewport?.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      document.removeEventListener("focusin", onViewportChange);
      document.removeEventListener("focusout", onViewportChange);
      observers.forEach((observer) => observer.disconnect());

      if (caretSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(caretSyncFrameRef.current);
      }
    };
  }, [cardRef, headerRef, measureLayout, scheduleCaretSync, syncViewport, toolsRef]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    scheduleCaretSync();
    const timers = [50, SPOT_LOCATION_CARD_KEYBOARD_TRANSITION_MS].map((delay) =>
      window.setTimeout(scheduleCaretSync, delay)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [isEditing, scheduleCaretSync, viewportState.keyboardBottom, toolsHeight]);

  useEffect(() => {
    if (viewportState.keyboardBottom <= 0) {
      return;
    }

    const lockViewportScroll = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    lockViewportScroll();
    window.visualViewport?.addEventListener("scroll", lockViewportScroll);

    return () => {
      window.visualViewport?.removeEventListener("scroll", lockViewportScroll);
    };
  }, [viewportState.keyboardBottom]);

  const isKeyboardOpen = viewportState.keyboardBottom > 8;
  const transition = `${SPOT_LOCATION_CARD_KEYBOARD_TRANSITION_MS}ms ${SPOT_LOCATION_CARD_KEYBOARD_EASING}`;

  const cardStageHeight = useMemo(() => {
    if (!isKeyboardOpen || !viewportState.viewportHeight) {
      return null;
    }

    return Math.max(160, viewportState.viewportHeight - headerHeight - toolsHeight);
  }, [headerHeight, isKeyboardOpen, toolsHeight, viewportState.viewportHeight]);

  const cardScale = useMemo(() => {
    if (!isKeyboardOpen || !cardStageHeight) {
      return 1;
    }

    const width = cardWidth || Math.min(window.innerWidth - 32, 448);
    const naturalHeight = width * (5 / 4);
    const targetHeight = cardStageHeight - 24;

    return Math.min(1, Math.max(0.5, targetHeight / naturalHeight));
  }, [cardStageHeight, cardWidth, isKeyboardOpen]);

  const cardTranslateY = useMemo(() => {
    if (!isKeyboardOpen || !cardStageHeight || !cardWidth) {
      return 0;
    }

    const naturalHeight = cardWidth * (5 / 4);
    const scaledHeight = naturalHeight * cardScale;
    const lift = (cardStageHeight - scaledHeight) * 0.08;

    return -Math.round(lift);
  }, [cardScale, cardStageHeight, cardWidth, isKeyboardOpen]);

  return {
    isKeyboardOpen,
    keyboardBottom: viewportState.keyboardBottom,
    viewportHeight: viewportState.viewportHeight,
    viewportOffsetTop: viewportState.viewportOffsetTop,
    headerHeight,
    toolsHeight,
    cardStageHeight,
    cardScale,
    cardTranslateY,
    transition,
    scheduleCaretSync,
  };
}
