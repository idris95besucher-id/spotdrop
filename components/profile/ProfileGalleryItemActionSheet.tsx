"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Image, PencilLine, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import { isProfileGalleryPhoto } from "@/lib/profileGallery";
import type { ProfileContentPost } from "@/lib/profileContent";

type ProfileGalleryItemActionSheetProps = {
  item: ProfileContentPost | null;
  onClose: () => void;
  onSetProfilePhoto: () => void;
  onEditDescription: () => void;
  onDelete: () => void;
};

export default function ProfileGalleryItemActionSheet({
  item,
  onClose,
  onSetProfilePhoto,
  onEditDescription,
  onDelete,
}: ProfileGalleryItemActionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const isOpen = Boolean(item);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !item || !mounted || typeof document === "undefined") {
    return null;
  }

  const canSetProfilePhoto = isProfileGalleryPhoto(item);
  const descriptionLabel = item.content?.trim()
    ? t("profile.galleryEditDescription")
    : t("profile.galleryAddDescription");

  return createPortal(
    <div className={`${bottomSheetLayout.overlay} z-[210]`} role="presentation">
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-gallery-item-actions-title"
        data-bottom-sheet-panel=""
        className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="profile-gallery-item-actions-title" className="text-base font-semibold text-white">
            {t("profile.galleryItemActions")}
          </h2>
        </div>

        <div className="space-y-1 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {canSetProfilePhoto ? (
            <button
              type="button"
              onClick={() => {
                onSetProfilePhoto();
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-white transition hover:bg-white/5"
            >
              <Image className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
              {t("profile.gallerySetProfilePhoto")}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              onEditDescription();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-white transition hover:bg-white/5"
          >
            <PencilLine className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
            {descriptionLabel}
          </button>

          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-5 w-5 shrink-0" aria-hidden />
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
