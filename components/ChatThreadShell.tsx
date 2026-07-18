"use client";

import { useRef, type ReactNode } from "react";
import { useKeyboardScrollLock } from "@/lib/keyboardSystem";
import { useInteractiveSwipeBack } from "@/lib/useInteractiveSwipeBack";

type ChatThreadShellProps = {
  children: ReactNode;
  /**
   * Enables the full-screen interactive swipe-back gesture when provided — pass the exact same
   * handler the screen's own header Back button uses, so the swipe is never a second,
   * divergent navigation path. Omitted by callers that don't want the gesture (e.g. channel
   * view) — swipe stays inert. Used by both city rooms and country rooms.
   */
  onBack?: () => void;
};

/**
 * City room / channel shell — fills the chat frame inside `.sd-app-root`.
 * Do not nest another h-[100dvh]; the app root already owns the viewport.
 *
 * `touch-pan-y` here tells the browser to only claim vertical touch gestures natively; a
 * horizontal touch (our back gesture) is left free for useInteractiveSwipeBack's own
 * touchmove/preventDefault instead of racing native scroll/rubber-band/selection handling.
 */
export default function ChatThreadShell({ children, onBack }: ChatThreadShellProps) {
  useKeyboardScrollLock();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { panelStyle } = useInteractiveSwipeBack({
    enabled: Boolean(onBack),
    onBack: onBack ?? (() => {}),
    targetRef: rootRef,
    panelRef,
  });

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex min-h-0 flex-col overflow-hidden touch-pan-y bg-[#050816] text-white"
    >
      <div ref={panelRef} style={panelStyle} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
