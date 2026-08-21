"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Loader2, MessageCircle, Share2, X } from "lucide-react";
import CityRoomPlacePreview from "@/components/CityRoomPlacePreview";
import ShareMapPlaceToCityRoomSheet from "@/components/ShareMapPlaceToCityRoomSheet";
import ShareMapPlaceToDmSheet from "@/components/ShareMapPlaceToDmSheet";
import { useI18n } from "@/components/I18nProvider";
import type { CityRoomPlacePayload } from "@/lib/cityRoomPlaceMessage";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  canNativeShareMapPlace,
  shareMapPlaceExternally,
} from "@/lib/mapPlaceShare";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type ShareMapPlaceSheetProps = {
  place: CityRoomPlacePayload | null;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSent?: () => void;
};

type ShareStep = "menu" | "city-room" | "dm";

export default function ShareMapPlaceSheet({
  place,
  userId,
  isOpen,
  onClose,
  onSent,
}: ShareMapPlaceSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<ShareStep>("menu");
  const [sharingExternal, setSharingExternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useBottomSheetScrollLock(isOpen && step === "menu");

  useEffect(() => {
    setMounted(true);
    setCanNativeShare(canNativeShareMapPlace());
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep("menu");
      setError(null);
      setSharingExternal(false);
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

  const handleExternalShare = async () => {
    if (!place || sharingExternal) {
      return;
    }

    setSharingExternal(true);
    setError(null);

    const result = await shareMapPlaceExternally(place);

    setSharingExternal(false);

    if (result.cancelled) {
      return;
    }

    if (result.ok) {
      return;
    }

    if (result.debug.usedApi === "clipboard-fallback") {
      setToastMessage(t("map.sharePlace.copiedFallback"));
      return;
    }

    setError(result.error?.message ?? t("map.sharePlace.error.shareFailed"));
  };

  const handleSent = () => {
    setToastMessage(t("map.sharePlace.sent"));
    onSent?.();
  };

  const localizedError = localizeUserMessage(t, error);

  if (!isOpen || !place || !mounted) {
    return null;
  }

  if (step === "city-room") {
    return (
      <ShareMapPlaceToCityRoomSheet
        place={place}
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
      <ShareMapPlaceToDmSheet
        place={place}
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
      description: t("map.sharePlace.sendToCityRoomDesc"),
      icon: Building2,
      onClick: () => setStep("city-room"),
    },
    {
      id: "dm" as const,
      label: t("map.sharePlace.sendInDm"),
      description: t("map.sharePlace.sendInDmDesc"),
      icon: MessageCircle,
      onClick: () => setStep("dm"),
    },
    {
      id: "external" as const,
      label: t("map.sharePlace.shareExternally"),
      description: t("map.sharePlace.shareExternallyDesc"),
      icon: Share2,
      onClick: () => void handleExternalShare(),
      disabled: !canNativeShare || sharingExternal,
      busy: sharingExternal,
    },
  ];

  return createPortal(
    <>
      <div className={`${bottomSheetLayout.overlay} z-[210]`}>
        <button type="button" className={bottomSheetLayout.backdrop} aria-label={t("common.close")} onClick={onClose} />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-map-place-title"
          data-bottom-sheet-panel
          className={`${bottomSheetLayout.panel} max-w-lg sd-modal-panel`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <h2 id="share-map-place-title" className="text-base font-semibold text-white">
                {t("map.sharePlace.title")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">{t("map.sharePlace.subtitle")}</p>
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
            <CityRoomPlacePreview
              name={place.name}
              address={place.address}
              description={place.description}
              imageUrl={place.imageUrl}
              city={place.city}
              region={place.region}
              country={place.country}
              latitude={place.latitude}
              longitude={place.longitude}
              compact
            />

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {menuOptions.map((option, index) => {
                const Icon = option.icon;
                const busy = "busy" in option && option.busy;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={option.disabled}
                    onClick={option.onClick}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8 disabled:cursor-not-allowed disabled:opacity-55 ${
                      index > 0 ? "border-t border-white/8" : ""
                    }`}
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      )}
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
            {!canNativeShare ? (
              <p className="text-xs text-slate-500">{t("map.sharePlace.externalUnavailable")}</p>
            ) : null}
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
