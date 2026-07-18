"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

export type MessageActionSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Omit to hide the Edit row (system messages, photos, voice messages, location cards). */
  onEdit?: () => void;
  /** Omit to hide the Delete row (past the 24-hour delete window). */
  onDelete?: () => void;
};

/**
 * Shared long-press action sheet for the user's own messages in DM, group, and City Room
 * chats: Edit (when allowed) / Delete for everyone / Cancel. Same bottom-sheet chrome as
 * ChatAttachmentMenu.
 */
export default function MessageActionSheet({ isOpen, onClose, onEdit, onDelete }: MessageActionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) {
    return null;
  }

  const runAndClose = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div className={`${bottomSheetLayout.overlay} z-[220]`}>
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-action-sheet-title"
        data-bottom-sheet-panel
        className={`${bottomSheetLayout.panel} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2 id="message-action-sheet-title" className="min-w-0 flex-1 truncate text-base font-semibold text-white">
            {t("messageActions.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} px-2 py-2`}>
          <div className="flex flex-col">
            {onEdit ? (
              <button
                type="button"
                onClick={() => runAndClose(onEdit)}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                  <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-white">{t("messageActions.edit")}</span>
              </button>
            ) : null}

            {onDelete ? (
              <button
                type="button"
                onClick={() => runAndClose(onDelete)}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-red-500/10 active:bg-red-500/15"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300 ring-1 ring-red-400/25">
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-red-200">
                  {t("messageActions.deleteForEveryone")}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="mt-1 flex w-full items-center justify-center rounded-2xl px-3.5 py-3.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 active:bg-white/8"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
