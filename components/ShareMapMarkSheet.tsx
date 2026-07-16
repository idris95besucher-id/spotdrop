"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, MessageCircle, X } from "lucide-react";
import MapMarkSharePreview from "@/components/MapMarkSharePreview";
import ShareMapMarkToCityRoomSheet from "@/components/ShareMapMarkToCityRoomSheet";
import ShareMapMarkToDmSheet from "@/components/ShareMapMarkToDmSheet";
import { useI18n } from "@/components/I18nProvider";
import type { CityRoomMapMarkPayload } from "@/lib/cityRoomMapMarkMessage";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type ShareMapMarkSheetProps = {
  mark: CityRoomMapMarkPayload | null;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;
};

type ShareStep = "menu" | "city-room" | "dm";

/** "Share" on MapMarkDetailSheet — send an existing Mark as a clickable card to DMs, group chats, or city rooms. */
export default function ShareMapMarkSheet({ mark, userId, isOpen, onClose, onSent }: ShareMapMarkSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<ShareStep>("menu");
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useBottomSheetScrollLock(isOpen && step === "menu");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep("menu");
      setError(null);
      setToastMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleSent = () => {
    setToastMessage(t("map.shareMark.sent"));
    onSent?.();
  };

  const localizedError = localizeUserMessage(t, error);

  if (!isOpen || !mark || !mounted) {
    return null;
  }

  if (step === "city-room") {
    return (
      <ShareMapMarkToCityRoomSheet
        mark={mark}
        userId={userId}
        isOpen
        onClose={onClose}
        onBack={() => setStep("menu")}
        onSent={handleSent}
      />
    );
  }

  if (step === "dm") {
    return (
      <ShareMapMarkToDmSheet
        mark={mark}
        userId={userId}
        isOpen
        onClose={onClose}
        onBack={() => setStep("menu")}
        onSent={handleSent}
      />
    );
  }

  const menuOptions = [
    {
      id: "city-room" as const,
      label: t("map.sharePlace.sendToCityRoom"),
      description: t("map.shareMark.sendToCityRoomDesc"),
      icon: Building2,
      onClick: () => setStep("city-room"),
    },
    {
      id: "dm" as const,
      label: t("map.sharePlace.sendInDm"),
      description: t("map.shareMark.sendInDmDesc"),
      icon: MessageCircle,
      onClick: () => setStep("dm"),
    },
  ];

  return createPortal(
    <>
      <div className={`${bottomSheetLayout.overlay} z-[210]`}>
        <button type="button" className={bottomSheetLayout.backdrop} aria-label={t("common.close")} onClick={onClose} />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-map-mark-title"
          data-bottom-sheet-panel
          className={`${bottomSheetLayout.panel} max-w-lg sd-modal-panel`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <h2 id="share-map-mark-title" className="text-base font-semibold text-white">
                {t("map.shareMark.title")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">{t("map.shareMark.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} space-y-4 px-5 py-4`}>
            <MapMarkSharePreview mark={mark} />

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {menuOptions.map((option, index) => {
                const Icon = option.icon;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={option.onClick}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8 ${
                      index > 0 ? "border-t border-white/8" : ""
                    }`}
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {localizedError ? <p className="text-xs text-red-300">{localizedError}</p> : null}
          </div>
        </div>
      </div>

      {toastMessage ? (
        <div
          className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 z-[230] -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-black shadow-lg">
            {toastMessage}
          </p>
        </div>
      ) : null}
    </>,
    document.body
  );
}
