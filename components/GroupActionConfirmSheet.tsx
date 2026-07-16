"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type GroupActionConfirmSheetProps = {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  working?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

/** Generic confirm sheet reused for leave/delete/remove/promote/demote/transfer group actions. */
export default function GroupActionConfirmSheet({
  isOpen,
  title,
  body,
  confirmLabel,
  destructive = false,
  working = false,
  error,
  onClose,
  onConfirm,
}: GroupActionConfirmSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={`${bottomSheetLayout.overlay} z-[210]`} role="presentation">
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={working ? undefined : onClose}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="group-confirm-title"
        data-bottom-sheet-panel=""
        className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-3 px-5 py-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <h2 id="group-confirm-title" className="text-base font-semibold text-white">
            {title}
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">{body}</p>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={working}
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={onConfirm}
              className={`inline-flex min-w-[6.5rem] items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                destructive ? "bg-red-500 text-white hover:bg-red-400" : "bg-primary text-[#050816] hover:brightness-110"
              }`}
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
