"use client";

import type { ReactNode } from "react";
import { useKeyboardInsets } from "@/lib/useKeyboardInsets";

type ChatThreadShellProps = {
  children: ReactNode;
};

export default function ChatThreadShell({ children }: ChatThreadShellProps) {
  const { isKeyboardOpen, visualViewportHeight } = useKeyboardInsets();

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden bg-[#050816] text-white"
      style={
        isKeyboardOpen && visualViewportHeight
          ? { height: `${visualViewportHeight}px`, maxHeight: `${visualViewportHeight}px` }
          : { height: "100dvh", maxHeight: "100dvh" }
      }
    >
      {children}
    </div>
  );
}
