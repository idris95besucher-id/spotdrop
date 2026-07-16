"use client";

import { useRef, type ReactNode } from "react";
import { useKeyboardScrollLock } from "@/lib/keyboardSystem";
import { useIosEdgeSwipeBack } from "@/lib/useIosEdgeSwipeBack";

type ChatThreadShellProps = {
  children: ReactNode;
  /**
   * Enables edge-swipe-to-go-back when provided — pass the exact same handler the screen's
   * own header Back button uses, so the swipe is never a second, divergent navigation path.
   * Omitted by callers that don't want the gesture (e.g. channel view) — swipe stays inert.
   */
  onBack?: () => void;
};

/**
 * City room / channel shell — fills the chat frame inside `.sd-app-root`.
 * Do not nest another h-[100dvh]; the app root already owns the viewport.
 */
export default function ChatThreadShell({ children, onBack }: ChatThreadShellProps) {
  useKeyboardScrollLock();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { panelStyle } = useIosEdgeSwipeBack({
    enabled: Boolean(onBack),
    onBack: onBack ?? (() => {}),
    targetRef: rootRef,
    panelRef,
  });

  return (
    <div ref={rootRef} className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[#050816] text-white">
      <div ref={panelRef} style={panelStyle} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
