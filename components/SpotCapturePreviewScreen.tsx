"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotLocationPicker, { type SpotLocationSourceKind } from "@/components/SpotLocationPicker";
import SpotVideoPreviewExitSheet from "@/components/SpotVideoPreviewExitSheet";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { MediaEditorItem } from "@/lib/mediaEditor";
import { formatSpotLocationLabelLocalized } from "@/lib/spotLocationDisplay";
import type { PlaceSearchResult, SpotGeoLocation } from "@/lib/spotLocation";

type SpotCapturePreviewScreenProps = {
  item: MediaEditorItem;
  spotName: string;
  locating: boolean;
  location: SpotGeoLocation | null;
  locationSource: SpotLocationSourceKind;
  matchedPlaceName: string | null;
  needsLocationChoice: boolean;
  locationHint: string | null;
  publishStatusMessage: string | null;
  offlineMode?: boolean;
  error: string | null;
  onSpotNameChange: (value: string) => void;
  onUseCurrentLocation: () => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
  onDiscard: () => void;
  onRetake: () => void;
  onNext: () => void;
};

export default function SpotCapturePreviewScreen({
  spotName,
  locating,
  location,
  locationSource,
  matchedPlaceName,
  needsLocationChoice,
  locationHint,
  publishStatusMessage,
  offlineMode = false,
  error,
  onSpotNameChange,
  onUseCurrentLocation,
  onSelectPlace,
  onDiscard,
  onRetake,
  onNext,
  item,
}: SpotCapturePreviewScreenProps) {
  const { t, locale } = useI18n();
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showExitSheet, setShowExitSheet] = useState(false);

  const nextDisableReason = offlineMode ? null : publishStatusMessage;
  const nextBlocked = nextDisableReason !== null;
  const localizedError = localizeUserMessage(t, error);

  const locationLabel = locating
    ? t("spotEditor.locating")
    : location
      ? formatSpotLocationLabelLocalized(location, locale)
      : null;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black text-white select-none overflow-hidden"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <img
        src={item.previewUrl}
        alt=""
        className="absolute inset-0 z-0 h-full w-full object-cover"
        draggable={false}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-black/65 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
      />

      <div
        className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={() => setShowExitSheet(true)}
          className="mt-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
          aria-label={t("spotEditor.back")}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onRetake}
            className="rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
          >
            {t("spotEditor.retake")}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!nextBlocked) onNext();
            }}
            aria-disabled={nextBlocked}
            className={`rounded-full px-5 py-2 text-sm font-bold backdrop-blur-sm transition ${
              nextBlocked
                ? "cursor-not-allowed bg-white/15 text-white/35"
                : "bg-white text-black active:scale-[0.98]"
            }`}
          >
            {t("spotEditor.next")}
          </button>
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 px-3 pb-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {showLocationPicker ? (
          <div className="rounded-2xl bg-black/60 p-3 backdrop-blur-md ring-1 ring-white/10">
            <SpotLocationPicker
              locating={locating}
              location={location}
              locationSource={locationSource}
              matchedPlaceName={matchedPlaceName}
              needsLocationChoice={needsLocationChoice}
              locationHint={locationHint}
              onUseCurrentLocation={onUseCurrentLocation}
              onSelectPlace={onSelectPlace}
            />
            <button
              type="button"
              onClick={() => setShowLocationPicker(false)}
              className="mt-2 w-full text-center text-xs text-white/50"
            >
              {t("common.close")}
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowLocationPicker((v) => !v)}
            className="flex w-full items-center gap-2 rounded-2xl bg-black/55 px-4 py-3 text-left text-sm text-white backdrop-blur-md ring-1 ring-white/12"
          >
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {locationLabel ?? t("spotEditor.addLocation")}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
          </button>

          <input
            value={spotName}
            onChange={(e) => onSpotNameChange(e.target.value)}
            placeholder={t("spotEditor.captionPlaceholder")}
            maxLength={120}
            className="w-full rounded-2xl bg-black/55 px-4 py-3 text-sm text-white placeholder-white/40 backdrop-blur-md ring-1 ring-white/12 focus:outline-none focus:ring-white/30"
          />
        </div>

        {localizedError ? (
          <p className="text-center text-xs text-red-400">{localizedError}</p>
        ) : null}
        {!localizedError && nextDisableReason ? (
          <p className="text-center text-xs text-amber-200/80">{nextDisableReason}</p>
        ) : null}
      </div>

      <SpotVideoPreviewExitSheet
        isOpen={showExitSheet}
        onDiscard={() => {
          setShowExitSheet(false);
          onDiscard();
        }}
        onCancel={() => setShowExitSheet(false)}
      />
    </div>
  );
}
