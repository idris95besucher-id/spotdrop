"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, ImagePlus, MapPin, Video } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotMediaCarousel, { type SpotCarouselSlide } from "@/components/SpotMediaCarousel";
import SpotVideoPreviewExitSheet from "@/components/SpotVideoPreviewExitSheet";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import SpotVideoSoundOption from "@/components/SpotVideoSoundOption";
import { getActiveMediaEditorItem, type MediaEditorItem } from "@/lib/mediaEditor";
import { MEDIA_EDITOR_MAX_ITEMS } from "@/lib/mediaEditor/types";
import { formatSpotLocationLabelLocalized } from "@/lib/spotLocationDisplay";
import { SPOT_CAPTION_MAX_LENGTH, normalizeSpotCaption } from "@/lib/spotCaption";
import type { SpotGeoLocation } from "@/lib/spotLocation";

type SpotComposeScreenProps = {
  mediaItems: MediaEditorItem[];
  activeMediaIndex: number;
  caption: string;
  location: SpotGeoLocation;
  matchedPlaceName: string | null;
  error: string | null;
  onCaptionChange: (value: string) => void;
  onActiveIndexChange: (index: number) => void;
  onAddPhoto: () => void;
  onAddVideo: () => void;
  onRemoveActive: () => void;
  onKeepSoundChange: (keepSound: boolean) => void;
  onRetake: () => void;
  onNext: () => void;
};

function toCarouselSlides(items: MediaEditorItem[]): SpotCarouselSlide[] {
  return items.map((item) => ({
    id: item.id,
    mediaUrl: item.previewUrl,
    mediaType: item.mediaType,
    posterUrl: item.coverPreviewUrl,
    audioMuted: item.mediaType === "video" ? !item.keepSound : false,
  }));
}

export default function SpotComposeScreen({
  mediaItems,
  activeMediaIndex,
  caption,
  location,
  matchedPlaceName,
  error,
  onCaptionChange,
  onActiveIndexChange,
  onAddPhoto,
  onAddVideo,
  onRemoveActive,
  onKeepSoundChange,
  onRetake,
  onNext,
}: SpotComposeScreenProps) {
  const { t, locale } = useI18n();
  const [showExitSheet, setShowExitSheet] = useState(false);
  const localizedError = localizeUserMessage(t, error);
  const canAddMore = mediaItems.length < MEDIA_EDITOR_MAX_ITEMS;
  const locationLabel = formatSpotLocationLabelLocalized(location, locale);
  const activeMedia = getActiveMediaEditorItem(mediaItems, activeMediaIndex);

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-black text-white select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div className="relative min-h-0 flex-1">
        <SpotMediaCarousel
          slides={toCarouselSlides(mediaItems)}
          isActive
          activeIndex={activeMediaIndex}
          onActiveIndexChange={onActiveIndexChange}
          showIndicator={mediaItems.length > 1}
          indicatorPlacement="compact"
          className="absolute inset-0 h-full w-full"
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/80 via-black/35 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-black/80 to-transparent"
        />

        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={() => setShowExitSheet(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50"
            aria-label={t("spotEditor.close")}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>

          <span className="rounded-full bg-black/35 px-3 py-1 text-sm font-semibold text-white/95 backdrop-blur-sm">
            {mediaItems.length > 1
              ? `${activeMediaIndex + 1} / ${mediaItems.length}`
              : t("spotCompose.title")}
          </span>

          <button
            type="button"
            onClick={onNext}
            className="flex h-10 items-center gap-0.5 rounded-full bg-black/35 px-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-black/50"
          >
            {t("spotEditor.next")}
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      <div
        className="relative z-30 shrink-0 space-y-3 border-t border-white/10 bg-[#050505] px-4 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start gap-2 rounded-xl bg-white/8 px-3 py-2.5 text-sm text-white/90">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/70" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{locationLabel}</p>
            {matchedPlaceName ? (
              <p className="truncate text-xs text-white/60">{matchedPlaceName}</p>
            ) : null}
            <p className="mt-1 text-[11px] text-white/50">{t("spotCompose.locationLocked")}</p>
          </div>
        </div>

        <textarea
          value={caption}
          rows={3}
          maxLength={SPOT_CAPTION_MAX_LENGTH}
          onChange={(event) => onCaptionChange(normalizeSpotCaption(event.target.value))}
          placeholder={`${t("spotEditor.captionPlaceholder")}\n${t("spotEditor.captionExamples")}`}
          className="w-full resize-none rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/45 focus:border-white/30 focus:outline-none [-webkit-user-select:text] [user-select:text]"
        />

        {activeMedia?.mediaType === "video" ? (
          <SpotVideoSoundOption
            keepSound={activeMedia.keepSound}
            onChange={onKeepSoundChange}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canAddMore ? (
            <>
              <button
                type="button"
                onClick={onAddPhoto}
                className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/18"
              >
                <ImagePlus className="h-4 w-4" aria-hidden />
                {t("spotCompose.addPhoto")}
              </button>
              <button
                type="button"
                onClick={onAddVideo}
                className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/18"
              >
                <Video className="h-4 w-4" aria-hidden />
                {t("spotCompose.addVideo")}
              </button>
            </>
          ) : null}
          {mediaItems.length > 1 ? (
            <button
              type="button"
              onClick={onRemoveActive}
              className="rounded-full bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
            >
              {t("spotCompose.removeMedia")}
            </button>
          ) : null}
        </div>

        {localizedError ? (
          <p className="text-center text-xs text-red-300">{localizedError}</p>
        ) : null}
      </div>

      <SpotVideoPreviewExitSheet
        isOpen={showExitSheet}
        onCancel={() => setShowExitSheet(false)}
        onDiscard={() => {
          setShowExitSheet(false);
          onRetake();
        }}
      />
    </div>
  );
}
