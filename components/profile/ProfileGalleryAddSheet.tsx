"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type ProfileGalleryAddSheetProps = {
  isOpen: boolean;
  uploading?: boolean;
  onClose: () => void;
  onAddPhoto: () => void;
};

export default function ProfileGalleryAddSheet({
  isOpen,
  uploading = false,
  onClose,
  onAddPhoto,
}: ProfileGalleryAddSheetProps) {
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
    <div className={bottomSheetLayout.overlay} role="presentation">
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-gallery-add-title"
        data-bottom-sheet-panel=""
        className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="profile-gallery-add-title" className="text-base font-semibold text-white">
            {t("profile.galleryAdd")}
          </h2>
        </div>

        <div className="space-y-1 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={uploading}
            onClick={onAddPhoto}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-white transition hover:bg-white/5 disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
            {t("profile.galleryAddPhoto")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
