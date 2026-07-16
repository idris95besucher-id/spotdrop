"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type RemoveFollowerConfirmSheetProps = {
  isOpen: boolean;
  username: string;
  removing?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function RemoveFollowerConfirmSheet({
  isOpen,
  username,
  removing = false,
  onClose,
  onConfirm,
}: RemoveFollowerConfirmSheetProps) {
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
        onClick={onClose}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-follower-title"
        data-bottom-sheet-panel=""
        className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-3 px-5 py-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <h2 id="remove-follower-title" className="text-base font-semibold text-white">
            {t("profile.removeFollowerConfirmTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            {t("profile.removeFollowerConfirmBody", { user: username })}
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={removing}
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={removing}
              onClick={onConfirm}
              className="inline-flex min-w-[5.5rem] items-center justify-center rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                t("profile.removeFollower")
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
