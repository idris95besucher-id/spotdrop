"use client";

import type { ReactNode } from "react";
import { useKeyboardScrollLock } from "@/lib/keyboardSystem";

type DmChatThreadShellProps = {
  children: ReactNode;
};

/** DM shell — fills chat frame inside `.sd-app-root`; scroll lock keeps header visible. */
export default function DmChatThreadShell({ children }: DmChatThreadShellProps) {
  useKeyboardScrollLock();

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[#050816] text-white">
      {children}
    </div>
  );
}
