"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotCompactCaptionField from "@/components/SpotCompactCaptionField";
import SpotMediaCarousel, { type SpotCarouselSlide } from "@/components/SpotMediaCarousel";
import SpotUploadProgressOverlay from "@/components/SpotUploadProgressOverlay";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  composerPaddingBottom,
  useComposerKeyboardStyle,
} from "@/lib/keyboardSystem";
import type { MediaEditorItem } from "@/lib/mediaEditor";
import { logSpotMediaSharePreviewItems } from "@/lib/spotMediaLog";
import type { SpotPublishDestination } from "@/lib/spotPublish";
import type { SpotUploadProgress } from "@/lib/spotUploadPipeline";

type SpotPublishScreenProps = {
  mediaItems: MediaEditorItem[];
  destination: SpotPublishDestination;
  caption: string;
  writeCaptionMyself: boolean;
  locationLabel: string;
  publishing: boolean;
  uploadProgress?: SpotUploadProgress | null;
  uploadFailed?: boolean;
  retryLabel?: string | null;
  offlineMode?: boolean;
  error: string | null;
  onCaptionChange: (value: string) => void;
  onWriteCaptionMyselfChange: (value: boolean) => void;
  onDestinationChange: (destination: SpotPublishDestination) => void;
  onBack: () => void;
  onPublish: () => void;
};

function toCarouselSlides(items: MediaEditorItem[]): SpotCarouselSlide[] {
  return items.map((item) => {
    const audioMuted = item.mediaType === "video" ? !item.keepSound : false;

    if (item.mediaType === "video") {
      console.log(
        `[SpotPublishScreen][audio] preview slide | keepSound=${item.keepSound} | audioMuted=${audioMuted} | fileType=${item.file.type} | fileSize=${item.file.size}`
      );
    }

    return {
      id: item.id,
      mediaUrl: item.previewUrl,
      // Was hardcoded to "image" regardless of the item's real type, which sent
      // every freshly-recorded video through the image renderer instead of a
      // video player — the Share preview never actually played video at all.
      mediaType: item.mediaType,
      posterUrl: item.coverPreviewUrl,
      // `keepSound` defaults true for video (see createMediaEditorItem) and is
      // only false if the user explicitly removed audio in the editor.
      audioMuted,
      isPanorama: Boolean(item.isPanorama),
      fallbackMediaUrl: item.fallbackPreviewUrl,
    };
  });
}

export default function SpotPublishScreen({
  mediaItems,
  destination,
  caption,
  writeCaptionMyself,
  locationLabel,
  publishing,
  uploadProgress = null,
  uploadFailed = false,
  retryLabel = null,
  offlineMode = false,
  error,
  onCaptionChange,
  onWriteCaptionMyselfChange,
  onDestinationChange,
  onBack,
  onPublish,
}: SpotPublishScreenProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const destinationRef = useRef<HTMLDivElement>(null);
  const { isKeyboardOpen, composerStyle } = useComposerKeyboardStyle();
  // Keep publish diagnostics visible — do not sanitize technical Supabase errors away.
  const localizedError =
    error?.includes("[SPOT PUBLISH]") || error?.includes("code=")
      ? error
      : localizeUserMessage(t, error);

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

  // My Spots is photos-only — a video can only ever go to Public Spot.
  const hasVideo = mediaItems.some((item) => item.mediaType === "video");

  useEffect(() => {
    if (hasVideo) {
      setDestinationOpen(false);

      if (destination !== "public") {
        onDestinationChange("public");
      }
    }
  }, [destination, hasVideo, onDestinationChange]);

  useEffect(() => {
    if (!destinationOpen || hasVideo) {
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
  }, [destinationOpen, hasVideo]);

  const isPublicDestination = destination === "public";
  const destinationLabel = isPublicDestination
    ? t("spotEditor.publicSpot")
    : t("spotEditor.mySpots");

  const hasPhotos = mediaItems.length > 0;
  const publishDisabled = publishing || offlineMode || !hasPhotos;

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col overflow-hidden bg-[#0a0b10] text-white"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <SpotUploadProgressOverlay
        visible={publishing}
        progress={uploadProgress}
        showDetailed
        retryLabel={retryLabel}
      />

      <header
        className="relative z-20 flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={publishing}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/8 disabled:opacity-50"
          aria-label={t("spotEditor.back")}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <h1 className="text-sm font-semibold tracking-wide text-white">{t("spotEditor.shareTitle")}</h1>

        <div className="h-10 w-10" aria-hidden />
      </header>

      <div className="relative min-h-0 flex-1 bg-black">
        {hasPhotos ? (
          <SpotMediaCarousel
            slides={toCarouselSlides(mediaItems)}
            isActive={!publishing}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            showIndicator
            indicatorPlacement="compact"
            showSwipeHint={mediaItems.length > 1}
            viewerPlayback={false}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
            {t("spotEditor.preview")}
          </div>
        )}
      </div>

      <div
        className="relative z-20 shrink-0 border-t border-white/8 bg-[#0a0b10]/95 backdrop-blur-xl"
        style={{
          ...composerStyle,
          paddingBottom: composerPaddingBottom("sheet", isKeyboardOpen),
        }}
      >
        <div className="space-y-3 px-4 py-3">
          {writeCaptionMyself ? (
            <div className="space-y-1.5">
              <SpotCompactCaptionField
                value={caption}
                disabled={publishing}
                onChange={onCaptionChange}
              />
              <button
                type="button"
                disabled={publishing}
                onClick={() => onWriteCaptionMyselfChange(false)}
                className="px-0.5 text-xs font-medium text-cyan-300/90 transition hover:text-cyan-200 disabled:opacity-50"
              >
                {t("spotEditor.letAiWriteCaption")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={publishing}
              onClick={() => onWriteCaptionMyselfChange(true)}
              className="flex w-full items-center justify-between rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-left ring-1 ring-white/10 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              <span className="text-sm text-white/70">{t("spotEditor.autoCaptionHint")}</span>
              <span className="shrink-0 text-xs font-semibold text-cyan-300/90">
                {t("spotEditor.writeCaptionMyself")}
              </span>
            </button>
          )}

          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3.5 py-2.5 ring-1 ring-white/10">
            <MapPin className="h-4 w-4 shrink-0 text-cyan-300" strokeWidth={1.75} aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-cyan-100/90">{locationLabel}</p>
          </div>

          {hasVideo ? (
            <p className="px-0.5 text-center text-xs leading-snug text-white/55">
              {t("spotEditor.videoPublicOnly")}
            </p>
          ) : (
            <div ref={destinationRef} className="relative">
              <button
                type="button"
                disabled={publishing}
                onClick={() => setDestinationOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-left ring-1 ring-white/10 transition hover:bg-white/[0.08] disabled:opacity-50"
                aria-expanded={destinationOpen}
                aria-haspopup="listbox"
              >
                <span className="text-xs text-white/60">{t("spotEditor.shareTo")}</span>
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
                      onDestinationChange("public");
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
                    onClick={() => {
                      onDestinationChange("my-spots");
                      setDestinationOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-white/6"
                  >
                    <span className="font-medium text-white">{t("spotEditor.mySpots")}</span>
                    {!isPublicDestination ? (
                      <Check className="h-4 w-4 text-cyan-300" strokeWidth={2.5} aria-hidden />
                    ) : null}
                  </button>
                </div>
              ) : null}
            </div>
          )}

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
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary py-3.5 text-sm font-bold text-background shadow-lg shadow-black/30 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
