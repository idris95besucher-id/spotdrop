"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Image, LocateFixed, MapPin, MapPinned, Radio, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type AttachmentMenuStep = "menu" | "location";

export type ChatAttachmentMenuProps = {
  isOpen: boolean;
  onClose: () => void;
  onSendPhoto: () => void;
  /** Omit to hide the Check Spot row — it needs a coherent single-recipient/group-member accept flow. */
  onCheckSpot?: () => void;
  onSendCurrentLocation: () => void;
  onShareLiveLocation: () => void;
  isSharingLiveLocation?: boolean;
  onStopLiveLocation?: () => void;
};

/**
 * Shared "+" attachment menu used identically by DM, group, and City Room composers. Same
 * bottom-sheet chrome as ShareMapPlaceSheet, same icon-row visual language as MapTapActionSheet.
 */
export default function ChatAttachmentMenu({
  isOpen,
  onClose,
  onSendPhoto,
  onCheckSpot,
  onSendCurrentLocation,
  onShareLiveLocation,
  isSharingLiveLocation = false,
  onStopLiveLocation,
}: ChatAttachmentMenuProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<AttachmentMenuStep>("menu");

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep("menu");
    }
  }, [isOpen]);

  if (!isOpen || !mounted) {
    return null;
  }

  const handleClose = () => {
    setStep("menu");
    onClose();
  };

  const runAndClose = (action: () => void) => {
    action();
    handleClose();
  };

  return createPortal(
    <div className={`${bottomSheetLayout.overlay} z-[220]`}>
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={handleClose}
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
          {step === "location" ? (
            <button
              type="button"
              onClick={() => setStep("menu")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label={t("common.back")}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <h2 id="chat-attachment-menu-title" className="min-w-0 flex-1 truncate text-base font-semibold text-white">
            {step === "location" ? t("chatAttach.sendLocation") : t("chatAttach.title")}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} px-2 py-2`}>
          {step === "menu" ? (
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
                onClick={() => setStep("location")}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                  <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-white">{t("chatAttach.sendLocation")}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              {isSharingLiveLocation ? (
                <button
                  type="button"
                  onClick={() => runAndClose(() => onStopLiveLocation?.())}
                  className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-red-500/10 active:bg-red-500/15"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300 ring-1 ring-red-400/25">
                    <Radio className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-red-200">{t("chatAttach.stopLiveLocation")}</span>
                    <span className="block text-xs text-red-300/70">{t("chatAttach.liveLocationActive")}</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => runAndClose(onShareLiveLocation)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                    <Radio className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{t("chatAttach.shareLiveLocation")}</span>
                    <span className="block text-xs text-slate-400">{t("chatAttach.shareLiveLocationDesc")}</span>
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => runAndClose(onSendCurrentLocation)}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                  <LocateFixed className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{t("chatAttach.sendCurrentLocation")}</span>
                  <span className="block text-xs text-slate-400">{t("chatAttach.sendCurrentLocationDesc")}</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
