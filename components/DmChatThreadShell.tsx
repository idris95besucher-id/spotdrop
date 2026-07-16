"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardScrollLock } from "@/lib/keyboardSystem";
import { navigateBack } from "@/lib/navigateBack";
import { useIosEdgeSwipeBack } from "@/lib/useIosEdgeSwipeBack";

type DmChatThreadShellProps = {
  children: ReactNode;
};

/**
 * DM shell — fills chat frame inside `.sd-app-root`; scroll lock keeps header visible.
 *
 * Also owns the edge-swipe-to-go-back gesture for both DM and group threads (the only two
 * screens that mount this shell). It's wired to the exact same action as the header's Back
 * button — DmThreadHeader / GroupThreadHeader both unconditionally
 * `navigateBack(router, "/chats", { preferFallback: true })` — so the swipe is never a second,
 * divergent navigation path, just an alternate gesture for the identical one.
 */
export default function DmChatThreadShell({ children }: DmChatThreadShellProps) {
  useKeyboardScrollLock();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { panelStyle } = useIosEdgeSwipeBack({
    onBack: () => navigateBack(router, "/chats", { preferFallback: true }),
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
