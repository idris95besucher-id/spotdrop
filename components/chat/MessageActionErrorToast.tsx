"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type MessageActionErrorToastProps = {
  message: string | null;
  onDismiss: () => void;
};

/**
 * Shared "Edit/Delete failed" toast for DM, group, and City Room message threads. Auto-dismisses
 * after a few seconds so a failed long-press action (e.g. delete blocked by RLS, or the edit/
 * delete window expiring) is never silently swallowed — the whole point of this component.
 */
export default function MessageActionErrorToast({ message, onDismiss }: MessageActionErrorToastProps) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[230] flex justify-center" role="status" aria-live="polite">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-red-400/30 bg-[#1a0f14]/95 px-4 py-3 text-sm font-medium text-red-100 shadow-xl shadow-black/40 ring-1 ring-red-400/20">
        <span className="min-w-0">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-300 transition hover:bg-white/10 hover:text-red-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
