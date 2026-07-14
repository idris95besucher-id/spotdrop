"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import {
  useChromeNavHidden,
  useEnsureFocusedInputVisible,
  useKeyboardViewportFrame,
} from "@/lib/keyboardSystem";
import { GALLERY_DESCRIPTION_MAX_LENGTH } from "@/lib/profileGallery";

type ProfileGalleryDescriptionSheetProps = {
  isOpen: boolean;
  initialDescription: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (description: string) => void;
};

export default function ProfileGalleryDescriptionSheet({
  isOpen,
  initialDescription,
  saving = false,
  onClose,
  onSave,
}: ProfileGalleryDescriptionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(initialDescription);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { overlayStyle, sheetMaxHeight, footerPadding } = useKeyboardViewportFrame();

  useBottomSheetScrollLock(isOpen);
  useChromeNavHidden("sheet-input", isOpen);
  useEnsureFocusedInputVisible(textareaRef, isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDraft(initialDescription);
    }
  }, [initialDescription, isOpen]);

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-x-0 z-[210] flex items-end justify-center overscroll-none sm:items-center sm:p-4"
      style={overlayStyle}
      role="presentation"
    >
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-gallery-description-title"
        data-bottom-sheet-panel=""
        className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
        style={{ maxHeight: sheetMaxHeight }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="profile-gallery-description-title" className="text-base font-semibold text-white">
            {initialDescription.trim()
              ? t("profile.galleryEditDescription")
              : t("profile.galleryAddDescription")}
          </h2>
        </div>

        <div className="space-y-3 px-4 py-4" style={{ paddingBottom: footerPadding }}>
          <textarea
            ref={textareaRef}
            value={draft}
            rows={4}
            maxLength={GALLERY_DESCRIPTION_MAX_LENGTH}
            disabled={saving}
            placeholder={t("profile.galleryDescriptionPlaceholder")}
            onChange={(event) => setDraft(event.target.value.slice(0, GALLERY_DESCRIPTION_MAX_LENGTH))}
            className="w-full resize-none rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/40 focus:border-white/25 focus:outline-none disabled:opacity-50 [-webkit-user-select:text] [user-select:text]"
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(draft)}
              className="inline-flex min-w-[5.5rem] items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("profile.gallerySaveDescription")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
