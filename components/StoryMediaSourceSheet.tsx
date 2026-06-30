"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type StoryMediaSourceSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onPhotoLibrary: () => void;
};

const SHEET_SPRING_MS = 300;
const SHEET_SPRING_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

export default function StoryMediaSourceSheet({
  isOpen,
  onClose,
  onTakePhoto,
  onPhotoLibrary,
}: StoryMediaSourceSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [present, setPresent] = useState(false);
  const [visible, setVisible] = useState(false);

  useBottomSheetScrollLock(present);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPresent(true);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setVisible(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => setPresent(false), SHEET_SPRING_MS);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  if (!present || !mounted) {
    return null;
  }

  const handleTakePhoto = () => {
    onTakePhoto();
    onClose();
  };

  const handlePhotoLibrary = () => {
    onPhotoLibrary();
    onClose();
  };

  const sheet = (
    <div className={bottomSheetLayout.overlay} role="presentation">
      <button
        type="button"
        className={`${bottomSheetLayout.backdrop} transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionTimingFunction: SHEET_SPRING_EASING }}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-media-source-title"
        data-bottom-sheet-panel=""
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026]/95 shadow-2xl shadow-black/60 backdrop-blur-xl select-none touch-manipulation sm:rounded-3xl"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${SHEET_SPRING_MS}ms ${SHEET_SPRING_EASING}`,
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="story-media-source-title" className="text-base font-semibold text-white">
            {t("story.source.title")}
          </h2>
        </div>

        <div className="space-y-1 p-2">
          <button
            type="button"
            onClick={handleTakePhoto}
            className="flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition hover:bg-white/5 active:bg-cyan-400/10"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-xl">
              📷
            </span>
            <span className="text-sm font-semibold text-white">{t("story.source.takePhoto")}</span>
          </button>

          <button
            type="button"
            onClick={handlePhotoLibrary}
            className="flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition hover:bg-white/5 active:bg-cyan-400/10"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-xl">
              🖼️
            </span>
            <span className="text-sm font-semibold text-white">{t("story.source.photoLibrary")}</span>
          </button>
        </div>

        <div className="px-2 pb-1 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="block w-full rounded-2xl px-4 py-3.5 text-center text-sm font-semibold text-cyan-300 transition hover:bg-white/5 active:bg-white/10"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
