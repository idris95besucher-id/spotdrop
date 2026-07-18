"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Image, MapPin, MapPinned, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

export type ChatAttachmentMenuProps = {
  isOpen: boolean;
  onClose: () => void;
  onSendPhoto: () => void;
  /** Omit to hide the Check Spot row — it needs a coherent single-recipient/group-member accept flow. */
  onCheckSpot?: () => void;
  onSendCurrentLocation: () => void;
};

/**
 * Shared "+" attachment menu used identically by DM, group, and City Room composers. Same
 * bottom-sheet chrome as ShareMapPlaceSheet, same icon-row visual language as MapTapActionSheet.
 * "Send location" sends a one-time current-location snapshot immediately — no sub-screen.
 */
export default function ChatAttachmentMenu({
  isOpen,
  onClose,
  onSendPhoto,
  onCheckSpot,
  onSendCurrentLocation,
}: ChatAttachmentMenuProps) {
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
        aria-labelledby="chat-attachment-menu-title"
        data-bottom-sheet-panel
        className={`${bottomSheetLayout.panel} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2 id="chat-attachment-menu-title" className="min-w-0 flex-1 truncate text-base font-semibold text-white">
            {t("chatAttach.title")}
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
            <button
              type="button"
              onClick={() => runAndClose(onSendPhoto)}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                <Image className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-white">{t("chatAttach.sendPhoto")}</span>
            </button>

            {onCheckSpot ? (
              <button
                type="button"
                onClick={() => runAndClose(onCheckSpot)}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                  <MapPinned className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-white">{t("chatAttach.checkSpot")}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => runAndClose(onSendCurrentLocation)}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-white">{t("chatAttach.sendLocation")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
