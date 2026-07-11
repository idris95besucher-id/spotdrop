"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, MapPin, UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { usePostViewerOptional } from "@/components/PostViewerProvider";
import SpotLocationSummary from "@/components/SpotLocationSummary";
import type { MapSpotPin } from "@/lib/spots";
import { getMapSpotPinPreviewUrl, getMapSpotPinTitle } from "@/lib/mapSpotPin";
import { normalizePostId } from "@/lib/postIds";
import { getReelMediaSources } from "@/lib/postViewerMedia";
import { getViewerSpotMediaUrl } from "@/lib/postViewer";
import { loadSpotMessagePreview } from "@/lib/spotMessagePreview";

type SpotMapPinSheetProps = {
  pin: MapSpotPin | null;
  embedded?: boolean;
  onClose: () => void;
};

function formatCreatedDate(iso: string | null | undefined, locale: string) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function SpotMapPinSheet({ pin, embedded = false, onClose }: SpotMapPinSheetProps) {
  const { t, locale } = useI18n();
  const postViewer = usePostViewerOptional();
  const [openingSpot, setOpeningSpot] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  if (!pin) {
    return null;
  }

  const previewUrl = getMapSpotPinPreviewUrl(pin);
  const title = getMapSpotPinTitle(pin);
  const visitCount = pin.visited_count ?? 0;
  const spotId = normalizePostId(pin.id);
  const profileHref = `/user?id=${encodeURIComponent(pin.user_id)}`;
  const createdLabel = formatCreatedDate(
    pin.created_at,
    locale === "de" ? "de-CH" : locale === "ru" ? "ru-RU" : "en-GB"
  );
  const caption = pin.content?.trim() || null;

  const thumbnailClassName =
    "relative flex h-20 w-20 shrink-0 touch-manipulation overflow-hidden rounded-full border-[2.5px] border-cyan-400/90 bg-[#0b1026] shadow-[0_0_0_2px_rgba(34,211,238,0.18),0_8px_24px_rgba(0,0,0,0.45),0_0_18px_rgba(34,211,238,0.22)] transition hover:border-cyan-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70";

  const thumbnailContent = previewUrl ? (
    <img src={previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#164e63] to-[#312e81] text-xl">
      📍
    </div>
  );

  const handleViewSpot = async () => {
    if (!spotId || openingSpot) {
      if (!spotId) {
        console.warn("[Map→Spot] missing post id on marker", { pin });
        setOpenError(t("spotShare.spotUnavailable"));
      }
      return;
    }

    setOpeningSpot(true);
    setOpenError(null);

    console.log("[Map→Spot] selected map marker post ID", spotId);

    const result = await loadSpotMessagePreview(spotId, locale);
    const viewerItem = result.viewerItem;
    const sources = viewerItem ? getReelMediaSources(viewerItem) : null;
    const mediaUrl = viewerItem ? getViewerSpotMediaUrl(viewerItem) : null;

    console.log("[Map→Spot] fetched post", {
      requestedId: spotId,
      fetchedId: viewerItem?.id ?? null,
      error: result.error,
      media_url: viewerItem?.media_url ?? null,
      image_url: viewerItem?.image_url ?? null,
      video_url: viewerItem?.video_url ?? null,
      media_type: viewerItem?.media_type ?? null,
      thumbnail_url: viewerItem?.thumbnail_url ?? null,
      video_cover_url: viewerItem?.video_cover_url ?? null,
      normalizedMediaUrl: mediaUrl,
      resolvedMediaType: sources?.mediaType ?? null,
      mediaLoadReady: Boolean(sources?.mediaUrl || sources?.posterUrl),
    });

    setOpeningSpot(false);

    if (!viewerItem) {
      console.warn("[Map→Spot] media load failure — post missing", { spotId, error: result.error });
      setOpenError(result.error ?? t("spotShare.spotUnavailable"));
      return;
    }

    if (!sources?.mediaUrl && !sources?.posterUrl) {
      console.warn("[Map→Spot] media load failure — no media fields", {
        spotId,
        fetchedId: viewerItem.id,
      });
      setOpenError(t("spotShare.spotUnavailable"));
      return;
    }

    console.log("[Map→Spot] media load success", {
      fetchedId: viewerItem.id,
      normalizedMediaUrl: sources.mediaUrl ?? sources.posterUrl,
      mediaType: sources.mediaType,
    });

    if (postViewer) {
      // Overlay keeps Visit map mounted (zoom / selected marker preserved on close).
      postViewer.openPostViewer([viewerItem], {
        initialSpotId: viewerItem.id,
        initialMediaUrl: result.preview?.thumbnailUrl ?? mediaUrl,
      });
      return;
    }

    window.location.assign(`/posts?id=${encodeURIComponent(viewerItem.id)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label={t("map.closeSpotDetails")}
        onClick={onClose}
        disabled={openingSpot}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-map-pin-title"
        className="relative z-10 w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#0a1020]/95 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        style={{
          paddingBottom: embedded
            ? "max(0.75rem, calc(env(safe-area-inset-bottom) + 54px))"
            : undefined,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>

        <div className="flex items-center gap-3 px-4 pt-3">
          <Link
            href={profileHref}
            onClick={onClose}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/35 bg-slate-800">
              {pin.avatar_url ? (
                <img src={pin.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-5 w-5 text-slate-400" aria-hidden />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">@{pin.username}</span>
              {createdLabel ? <span className="block text-xs text-slate-400">{createdLabel}</span> : null}
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            disabled={openingSpot}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={() => void handleViewSpot()}
            disabled={openingSpot || !spotId}
            className={thumbnailClassName}
            aria-label={t("map.openSpot")}
          >
            {thumbnailContent}
          </button>

          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="spot-map-pin-title" className="truncate text-base font-semibold text-white">
              {title}
            </h2>

            {caption && caption !== "spot_location_card" ? (
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-300">{caption}</p>
            ) : null}

            {pin.location_line ? (
              <SpotLocationSummary
                location={{
                  id: pin.id,
                  user_id: pin.user_id,
                  content_kind: "spot",
                  spot_name: pin.spot_name,
                  spot_address: pin.spot_address,
                  spot_city: pin.spot_city,
                  spot_country: pin.spot_country,
                  spot_latitude: pin.latitude,
                  spot_longitude: pin.longitude,
                }}
                className="mt-1.5 text-xs text-slate-300"
              />
            ) : (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-400">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/80" aria-hidden />
                <span>{t("map.locationAvailable")}</span>
              </p>
            )}

            <p className="mt-2 text-xs font-medium text-slate-300" aria-label={t("spotStats.visited")}>
              <span aria-hidden>👣</span> {visitCount.toLocaleString()}
            </p>
          </div>
        </div>

        {openError ? (
          <p className="px-4 pb-2 text-center text-xs text-red-300" role="alert">
            {openError}
          </p>
        ) : null}

        <div className="border-t border-white/8 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void handleViewSpot()}
            disabled={openingSpot || !spotId}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-[0.99] disabled:opacity-60"
          >
            {openingSpot ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {openingSpot ? t("spotShare.loadingSpot") : t("map.viewSpot")}
          </button>
        </div>
      </div>
    </div>
  );
}
