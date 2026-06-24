"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type SpotVideoPreviewExitSheetProps = {
  isOpen: boolean;
  saving?: boolean;
  onSaveToDrafts: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export default function SpotVideoPreviewExitSheet({
  isOpen,
  saving = false,
  onSaveToDrafts,
  onDiscard,
  onCancel,
}: SpotVideoPreviewExitSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !mounted) {
    return null;
  }

  const sheet = (
    <div className="fixed inset-0 z-[140] flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-label={t("common.close")}
        onClick={onCancel}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-video-exit-title"
        className="relative z-10 mx-3 mb-3 overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/8 px-5 py-4 text-center">
          <h2 id="spot-video-exit-title" className="text-base font-semibold text-white">
            {t("spotEditor.exit.title")}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/55">{t("spotEditor.exit.body")}</p>
        </div>

        <div className="p-2">
          <button
            type="button"
            disabled={saving}
            onClick={onSaveToDrafts}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-[15px] font-semibold text-white transition active:bg-white/10 disabled:opacity-50"
          >
            <Bookmark className="h-5 w-5 text-white/80" strokeWidth={1.75} aria-hidden />
            {saving ? t("spotEditor.saving") : t("spotEditor.exit.saveToDrafts")}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={onDiscard}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-[15px] font-semibold text-red-400 transition active:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            {t("spotEditor.exit.discardVideo")}
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
        className="relative z-10 mx-3 mb-3 rounded-2xl bg-[#1c1c1c]/95 py-3.5 text-[15px] font-semibold text-white shadow-lg backdrop-blur-xl transition active:bg-white/10 disabled:opacity-50"
        style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {t("common.cancel")}
      </button>
    </div>
  );

  return createPortal(sheet, document.body);
}
