"use client";

import { useEffect } from "react";
import { startKeyboardVisibilityTracking } from "@/lib/keyboardSystem";

/** Boots the shared keyboardVisibility store once for the whole app. */
export default function KeyboardVisibilityBootstrap() {
  useEffect(() => {
    void startKeyboardVisibilityTracking();
  }, []);

  return null;
}
