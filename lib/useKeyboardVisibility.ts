"use client";

import { useSyncExternalStore } from "react";
import {
  getKeyboardVisibilityState,
  startKeyboardVisibilityTracking,
  subscribeKeyboardVisibility,
  type KeyboardVisibilityState,
} from "@/lib/keyboardVisibility";

const EMPTY: KeyboardVisibilityState = {
  isKeyboardOpen: false,
  keyboardBottom: 0,
  visualViewportHeight: null,
  visualViewportOffsetTop: 0,
};

function subscribe(onStoreChange: () => void) {
  void startKeyboardVisibilityTracking();
  return subscribeKeyboardVisibility(() => {
    onStoreChange();
  });
}

function getSnapshot() {
  return getKeyboardVisibilityState();
}

function getServerSnapshot() {
  return EMPTY;
}

/** Shared keyboard metrics — Capacitor Keyboard + visualViewport (one source of truth). */
export function useKeyboardVisibility() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
