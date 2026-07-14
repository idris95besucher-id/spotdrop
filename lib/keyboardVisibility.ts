import { Capacitor } from "@capacitor/core";

export const KEYBOARD_OPEN_BODY_ATTR = "data-keyboard-open";
export const CHROME_NAV_HIDDEN_BODY_ATTR = "data-chrome-nav-hidden";

/** Reasons that force the global bottom nav out of layout (ref-counted). */
export type ChromeNavHideReason =
  | "keyboard"
  | "map-search-focus"
  | "mark-create-sheet"
  | "map-sheet"
  | "sheet-input";

export type KeyboardVisibilityState = {
  isKeyboardOpen: boolean;
  /**
   * Layout px still covered below the visual viewport.
   * 0 when Capacitor/body already resized the layout viewport — do NOT add native
   * keyboard height here (that double-lifts composers).
   */
  keyboardBottom: number;
  /** Visible viewport height in px. */
  visualViewportHeight: number | null;
  /** visualViewport.offsetTop (Safari URL bar). */
  visualViewportOffsetTop: number;
};

type Listener = (state: KeyboardVisibilityState) => void;

const KEYBOARD_OPEN_THRESHOLD_PX = 48;
const CLOSE_DEBOUNCE_MS = 80;

const hideReasons = new Set<ChromeNavHideReason>();
const listeners = new Set<Listener>();

let started = false;
let nativeShowHandle: { remove: () => Promise<void> } | null = null;
let nativeHideHandle: { remove: () => Promise<void> } | null = null;
/** Native keyboard open flag only — never used as a composer pixel offset. */
let nativeKeyboardOpen = false;
let closeTimer: number | null = null;

let state: KeyboardVisibilityState = {
  isKeyboardOpen: false,
  keyboardBottom: 0,
  visualViewportHeight: null,
  visualViewportOffsetTop: 0,
};

function readVisualViewportMetrics(): Omit<KeyboardVisibilityState, "isKeyboardOpen"> {
  if (typeof window === "undefined") {
    return {
      keyboardBottom: 0,
      visualViewportHeight: null,
      visualViewportOffsetTop: 0,
    };
  }

  const viewport = window.visualViewport;

  if (!viewport) {
    return {
      keyboardBottom: 0,
      visualViewportHeight: Math.round(window.innerHeight),
      visualViewportOffsetTop: 0,
    };
  }

  return {
    keyboardBottom: Math.max(
      0,
      Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
    ),
    visualViewportHeight: Math.round(viewport.height),
    visualViewportOffsetTop: Math.round(viewport.offsetTop),
  };
}

function syncChromeNavHiddenAttr() {
  if (typeof document === "undefined") {
    return;
  }

  if (hideReasons.size > 0) {
    document.body.setAttribute(CHROME_NAV_HIDDEN_BODY_ATTR, "true");
  } else {
    document.body.removeAttribute(CHROME_NAV_HIDDEN_BODY_ATTR);
  }
}

function syncKeyboardOpenAttr(isOpen: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  if (isOpen) {
    document.body.setAttribute(KEYBOARD_OPEN_BODY_ATTR, "true");
  } else {
    document.body.removeAttribute(KEYBOARD_OPEN_BODY_ATTR);
  }

  setChromeNavHidden("keyboard", isOpen);
}

function publish(next: KeyboardVisibilityState) {
  state = next;
  listeners.forEach((listener) => listener(state));
}

function applyOpenState(partial: Partial<KeyboardVisibilityState> & { isKeyboardOpen: boolean }) {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  const metrics = readVisualViewportMetrics();
  const next: KeyboardVisibilityState = {
    isKeyboardOpen: partial.isKeyboardOpen,
    // Overlap only — never fold in native keyboardHeight (body/webview resize owns that).
    keyboardBottom: partial.keyboardBottom ?? (partial.isKeyboardOpen ? metrics.keyboardBottom : 0),
    visualViewportHeight: partial.visualViewportHeight ?? metrics.visualViewportHeight,
    visualViewportOffsetTop: partial.visualViewportOffsetTop ?? metrics.visualViewportOffsetTop,
  };

  if (
    next.isKeyboardOpen === state.isKeyboardOpen &&
    next.keyboardBottom === state.keyboardBottom &&
    next.visualViewportHeight === state.visualViewportHeight &&
    next.visualViewportOffsetTop === state.visualViewportOffsetTop
  ) {
    return;
  }

  syncKeyboardOpenAttr(next.isKeyboardOpen);
  publish(next);
}

function scheduleClose() {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
  }

  closeTimer = window.setTimeout(() => {
    closeTimer = null;
    nativeKeyboardOpen = false;
    const metrics = readVisualViewportMetrics();
    const stillOpen = metrics.keyboardBottom > KEYBOARD_OPEN_THRESHOLD_PX;

    if (stillOpen) {
      applyOpenState({
        isKeyboardOpen: true,
        keyboardBottom: metrics.keyboardBottom,
        visualViewportHeight: metrics.visualViewportHeight,
        visualViewportOffsetTop: metrics.visualViewportOffsetTop,
      });
      return;
    }

    applyOpenState({
      isKeyboardOpen: false,
      keyboardBottom: 0,
      visualViewportHeight: metrics.visualViewportHeight,
      visualViewportOffsetTop: metrics.visualViewportOffsetTop,
    });
  }, CLOSE_DEBOUNCE_MS);
}

function syncFromVisualViewport() {
  const metrics = readVisualViewportMetrics();
  const vvOpen = metrics.keyboardBottom > KEYBOARD_OPEN_THRESHOLD_PX;
  const isOpen = vvOpen || nativeKeyboardOpen;

  if (!isOpen) {
    if (state.isKeyboardOpen) {
      scheduleClose();
    } else {
      publish({
        isKeyboardOpen: false,
        keyboardBottom: 0,
        visualViewportHeight: metrics.visualViewportHeight,
        visualViewportOffsetTop: metrics.visualViewportOffsetTop,
      });
    }
    return;
  }

  applyOpenState({
    isKeyboardOpen: true,
    keyboardBottom: metrics.keyboardBottom,
    visualViewportHeight: metrics.visualViewportHeight,
    visualViewportOffsetTop: metrics.visualViewportOffsetTop,
  });
}

/**
 * Hide/show global bottom navigation for a named reason (ref-counted).
 * Prefer this over page-specific body attributes.
 */
export function setChromeNavHidden(reason: ChromeNavHideReason, hidden: boolean) {
  if (hidden) {
    hideReasons.add(reason);
  } else {
    hideReasons.delete(reason);
  }

  syncChromeNavHiddenAttr();
}

export function getKeyboardVisibilityState(): KeyboardVisibilityState {
  return state;
}

export function subscribeKeyboardVisibility(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

/** Start once at app boot — Capacitor Keyboard + visualViewport. */
export async function startKeyboardVisibilityTracking() {
  if (started || typeof window === "undefined") {
    return;
  }

  started = true;
  syncFromVisualViewport();

  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", syncFromVisualViewport);
  viewport?.addEventListener("scroll", syncFromVisualViewport);
  window.addEventListener("resize", syncFromVisualViewport);

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");

    // Native WebView resize keeps absolute/flex chat shells above the keyboard.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });

    nativeShowHandle = await Keyboard.addListener("keyboardWillShow", () => {
      nativeKeyboardOpen = true;
      const metrics = readVisualViewportMetrics();
      applyOpenState({
        isKeyboardOpen: true,
        keyboardBottom: metrics.keyboardBottom,
        visualViewportHeight: metrics.visualViewportHeight,
        visualViewportOffsetTop: metrics.visualViewportOffsetTop,
      });
    });

    nativeHideHandle = await Keyboard.addListener("keyboardWillHide", () => {
      nativeKeyboardOpen = false;
      scheduleClose();
    });
  } catch {
    // Plugin unavailable — visualViewport path remains active.
  }
}

export function stopKeyboardVisibilityTracking() {
  if (!started || typeof window === "undefined") {
    return;
  }

  started = false;
  const viewport = window.visualViewport;
  viewport?.removeEventListener("resize", syncFromVisualViewport);
  viewport?.removeEventListener("scroll", syncFromVisualViewport);
  window.removeEventListener("resize", syncFromVisualViewport);

  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  void nativeShowHandle?.remove();
  void nativeHideHandle?.remove();
  nativeShowHandle = null;
  nativeHideHandle = null;
  nativeKeyboardOpen = false;
  hideReasons.delete("keyboard");
  syncKeyboardOpenAttr(false);
  syncChromeNavHiddenAttr();
}
