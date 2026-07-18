"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardScrollLock } from "@/lib/keyboardSystem";
import { navigateBack } from "@/lib/navigateBack";
import { useInteractiveSwipeBack } from "@/lib/useInteractiveSwipeBack";

type DmChatThreadShellProps = {
  children: ReactNode;
};

/**
 * DM shell — fills chat frame inside `.sd-app-root`; scroll lock keeps header visible.
 *
 * Also owns the full-screen interactive swipe-back gesture for both DM and group threads (the
 * only two screens that mount this shell) — the gesture can start from anywhere on screen, not
 * just the left edge (see useInteractiveSwipeBack). It's wired to the exact same action as the
 * header's Back button — DmThreadHeader / GroupThreadHeader both unconditionally
 * `navigateBack(router, "/chats", { preferFallback: true })` — so the swipe is never a second,
 * divergent navigation path, just an alternate gesture for the identical one.
 *
 * `touch-pan-y` here tells the browser to only claim vertical touch gestures natively; a
 * horizontal touch (our back gesture) is left free for useInteractiveSwipeBack's own
 * touchmove/preventDefault instead of racing native scroll/rubber-band/selection handling.
 */
export default function DmChatThreadShell({ children }: DmChatThreadShellProps) {
  useKeyboardScrollLock();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { panelStyle } = useInteractiveSwipeBack({
    onBack: () => navigateBack(router, "/chats", { preferFallback: true }),
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
