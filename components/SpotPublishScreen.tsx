"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, MapPin, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotMediaCarousel, { type SpotCarouselSlide } from "@/components/SpotMediaCarousel";
import SpotUploadProgressOverlay from "@/components/SpotUploadProgressOverlay";
import type { CollectionWithMeta } from "@/lib/collections";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { MediaEditorItem } from "@/lib/mediaEditor";
import { getActiveMediaEditorItem } from "@/lib/mediaEditor";
import { logSpotMediaSharePreviewItems } from "@/lib/spotMediaLog";
import { SPOT_CAPTION_MAX_LENGTH, normalizeSpotCaption } from "@/lib/spotCaption";
import type { SpotUploadProgress } from "@/lib/spotUploadPipeline";

type SpotPublishScreenProps = {
  mediaItems: MediaEditorItem[];
  collections: CollectionWithMeta[];
  collectionId: string;
  collectionsLoading?: boolean;
  caption: string;
  locationLabel: string;
  publishing: boolean;
  uploadProgress?: SpotUploadProgress | null;
  uploadFailed?: boolean;
  offlineMode?: boolean;
  error: string | null;
  onCaptionChange: (value: string) => void;
  onCollectionChange: (collectionId: string) => void;
  onBack: () => void;
  onPublish: () => void;
  onKeepSoundChange: (keepSound: boolean, mediaIndex: number) => void;
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

export default function SpotPublishScreen({
  mediaItems,
  collections,
  collectionId,
  collectionsLoading = false,
  caption,
  locationLabel,
  publishing,
  uploadProgress = null,
  uploadFailed = false,
  offlineMode = false,
  error,
  onCaptionChange,
  onCollectionChange,
  onBack,
  onPublish,
  onKeepSoundChange,
}: SpotPublishScreenProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const destinationRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const localizedError = localizeUserMessage(t, error);
  const activeMedia = getActiveMediaEditorItem(mediaItems, activeIndex);
  const captionLength = caption.length;

  useEffect(() => {
    logSpotMediaSharePreviewItems(
      mediaItems.map((item) => ({
        id: item.id,
        mediaType: item.mediaType,
        previewUrl: item.previewUrl,
      }))
    );
  }, [mediaItems]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, mediaItems.length - 1)));
  }, [mediaItems.length]);

  useEffect(() => {
    if (!destinationOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!destinationRef.current?.contains(event.target as Node)) {
        setDestinationOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [destinationOpen]);

  const mySpotsCollection =
    collections.find((c) => c.visibility === "private") ?? collections[0] ?? null;

  const isPublicDestination = collectionId === "";
  const destinationLabel = isPublicDestination
    ? t("spotEditor.publicSpot")
    : t("spotEditor.mySpots");

  const publishDisabled = publishing || offlineMode;
  const activeVideoKeepSound = activeMedia?.mediaType === "video" ? activeMedia.keepSound : true;

  return (
    <div
      className="fixed inset-0 z-[130] overflow-hidden bg-black text-white"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <SpotUploadProgressOverlay
        visible={publishing}
        progress={uploadProgress}
        showDetailed
      />

      <div className="absolute inset-0">
        {mediaItems.length > 0 ? (
          <SpotMediaCarousel
            slides={toCarouselSlides(mediaItems)}
            isActive={!publishing}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            showIndicator
            indicatorPlacement="fullscreen"
            showSwipeHint
            viewerPlayback={!publishing}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/40">
            {t("spotEditor.preview")}
          </div>
        )}
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/75 via-black/35 to-transparent"
        style={{ paddingBottom: "2.5rem" }}
      >
        <div
          className="pointer-events-auto flex items-center justify-between px-4 py-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onBack}
            disabled={publishing}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/50 disabled:opacity-50"
            aria-label={t("spotEditor.back")}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>

          <h1 className="text-sm font-semibold tracking-wide text-white drop-shadow-sm">
            {t("spotEditor.shareTitle")}
          </h1>

          <div className="h-10 w-10" aria-hidden />
        </div>
      </div>

      {activeMedia?.mediaType === "video" && !destinationOpen ? (
        <button
          type="button"
          disabled={publishing}
          onClick={() => onKeepSoundChange(!activeVideoKeepSound, activeIndex)}
          className="absolute right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/60 disabled:opacity-50"
          style={{ bottom: "max(10.5rem, calc(env(safe-area-inset-bottom) + 9.75rem))" }}
          aria-label={
            activeVideoKeepSound ? t("spotCompose.keepSound") : t("spotCompose.removeSound")
          }
        >
          {activeVideoKeepSound ? (
            <Volume2 className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          ) : (
            <VolumeX className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
          )}
        </button>
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/55 to-transparent pt-24"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto space-y-3 px-4">
          <div className="mx-auto w-full max-w-md space-y-2.5">
            <div className="flex items-start gap-2.5 rounded-2xl bg-black/45 px-3.5 py-3 ring-1 ring-white/12 backdrop-blur-md">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" strokeWidth={1.75} aria-hidden />
              <p className="min-w-0 flex-1 text-sm font-medium text-cyan-100/90">{locationLabel}</p>
            </div>

            <div className="relative">
              <textarea
                ref={captionRef}
                value={caption}
                disabled={publishing}
                rows={3}
                maxLength={SPOT_CAPTION_MAX_LENGTH}
                placeholder={`${t("spotEditor.captionPlaceholder")}\n${t("spotEditor.captionExamples")}`}
                onChange={(event) => onCaptionChange(normalizeSpotCaption(event.target.value))}
                className="w-full resize-none rounded-2xl border-0 bg-black/45 px-4 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/40 ring-1 ring-white/12 backdrop-blur-md focus:outline-none focus:ring-white/25 disabled:opacity-50 [-webkit-user-select:text] [user-select:text]"
              />
              {captionLength > SPOT_CAPTION_MAX_LENGTH - 50 ? (
                <span className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] tabular-nums text-white/45">
                  {captionLength}/{SPOT_CAPTION_MAX_LENGTH}
                </span>
              ) : null}
            </div>
          </div>

          <div ref={destinationRef} className="relative mx-auto w-full max-w-md">
            <button
              type="button"
              disabled={publishing}
              onClick={() => setDestinationOpen((open) => !open)}
              className="flex w-full items-center justify-between rounded-full bg-black/45 px-4 py-2.5 text-left ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/55 disabled:opacity-50"
              aria-expanded={destinationOpen}
              aria-haspopup="listbox"
            >
              <span className="text-xs text-white/65">{t("spotEditor.shareTo")}</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-white">
                {destinationLabel}
                <ChevronDown
                  className={`h-4 w-4 text-white/55 transition ${destinationOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </span>
            </button>

            {destinationOpen ? (
              <div
                role="listbox"
                className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl bg-[#12141c]/95 py-1 shadow-2xl ring-1 ring-white/12 backdrop-blur-xl"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={isPublicDestination}
                  onClick={() => {
                    onCollectionChange("");
                    setDestinationOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-white/6"
                >
                  <span className="font-medium text-white">{t("spotEditor.publicSpot")}</span>
                  {isPublicDestination ? (
                    <Check className="h-4 w-4 text-cyan-300" strokeWidth={2.5} aria-hidden />
                  ) : null}
                </button>

                <button
                  type="button"
                  role="option"
                  aria-selected={!isPublicDestination}
                  disabled={collectionsLoading || !mySpotsCollection}
                  onClick={() => {
                    if (!mySpotsCollection) {
                      return;
                    }

                    onCollectionChange(mySpotsCollection.id);
                    setDestinationOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-white/6 disabled:opacity-50"
                >
                  <span className="font-medium text-white">{t("spotEditor.mySpots")}</span>
                  {!isPublicDestination ? (
                    <Check className="h-4 w-4 text-cyan-300" strokeWidth={2.5} aria-hidden />
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>

          {offlineMode ? (
            <p className="text-center text-xs text-white/70">{t("spotEditor.offlineHint")}</p>
          ) : null}
          {localizedError ? (
            <p className="text-center text-xs text-red-300">{localizedError}</p>
          ) : null}

          <button
            type="button"
            onClick={onPublish}
            disabled={publishDisabled}
            className="mx-auto flex w-full max-w-md items-center justify-center gap-1.5 rounded-full bg-primary py-3.5 text-sm font-bold text-background shadow-lg shadow-black/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing
              ? t("spotEditor.publishing")
              : uploadFailed
                ? t("spotEditor.retryUpload")
                : t("spotEditor.shareSpot")}
            {!publishing ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
