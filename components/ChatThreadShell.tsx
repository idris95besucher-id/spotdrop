"use client";

import type { ReactNode } from "react";
import { useKeyboardScrollLock } from "@/lib/keyboardSystem";

type ChatThreadShellProps = {
  children: ReactNode;
};

/**
 * City room / channel shell — fills the chat frame inside `.sd-app-root`.
 * Do not nest another h-[100dvh]; the app root already owns the viewport.
 */
export default function ChatThreadShell({ children }: ChatThreadShellProps) {
  useKeyboardScrollLock();

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[#050816] text-white">
      {children}
    </div>
  );
}
