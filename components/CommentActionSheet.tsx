"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

export type CommentActionSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Omit to hide the Edit row (author only, and only within the 15-minute edit window). */
  onEdit?: () => void;
  /** Omit to hide the Delete row (author only). */
  onDelete?: () => void;
};

/**
 * Shared long-press/menu action sheet for a user's own comment — reused identically everywhere
 * comments render (My Gallery, other users' galleries, Spot/post comments, feed, ...) since they
 * all go through the one PostCommentsSection component. Other users' comments never get this
 * sheet at all (no long-press handler is attached to them).
 */
export default function CommentActionSheet({ isOpen, onClose, onEdit, onDelete }: CommentActionSheetProps) {
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
        aria-labelledby="comment-action-sheet-title"
        data-bottom-sheet-panel
        className={`${bottomSheetLayout.panel} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2 id="comment-action-sheet-title" className="min-w-0 flex-1 truncate text-base font-semibold text-white">
            {t("comments.actions.title")}
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
                <span className="min-w-0 flex-1 text-sm font-semibold text-white">{t("comments.actions.edit")}</span>
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
                  {t("comments.actions.delete")}
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
