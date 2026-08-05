"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

export type ProfileAvatarActionSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  hasAvatar: boolean;
  onViewPhoto: () => void;
  onOpenPrivateProfile: () => void;
};

/**
 * Bottom sheet for the large live-profile avatar:
 * View profile photo / Open private profile / Cancel.
 */
export default function ProfileAvatarActionSheet({
  isOpen,
  onClose,
  hasAvatar,
  onViewPhoto,
  onOpenPrivateProfile,
}: ProfileAvatarActionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) {
    return null;
  }

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
        aria-labelledby="profile-avatar-action-sheet-title"
        data-bottom-sheet-panel
        className={`${bottomSheetLayout.panel} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2
            id="profile-avatar-action-sheet-title"
            className="min-w-0 flex-1 truncate text-base font-semibold text-white"
          >
            {t("profileAvatar.menuTitle")}
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
          <div className="flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
            {hasAvatar ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewPhoto();
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                  <ImageIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-white">
                  {t("profileAvatar.viewPhoto")}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPrivateProfile();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-white ring-1 ring-white/10">
                <UserRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-white">
                {t("profileAvatar.openPrivateProfile")}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="mt-1 flex min-h-12 w-full items-center justify-center rounded-2xl px-3.5 py-3.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 active:bg-white/8"
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
