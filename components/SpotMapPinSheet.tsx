"use client";

import Link from "next/link";
import { MapPin, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { MapSpotPin } from "@/lib/spots";
import { getMapSpotPinPreviewUrl, getMapSpotPinTitle } from "@/lib/mapSpotPin";
import { normalizePostId } from "@/lib/postIds";
import SpotLocationSummary from "@/components/SpotLocationSummary";

type SpotMapPinSheetProps = {
  pin: MapSpotPin | null;
  onClose: () => void;
};

export default function SpotMapPinSheet({ pin, onClose }: SpotMapPinSheetProps) {
  const { t } = useI18n();

  if (!pin) {
    return null;
  }

  const previewUrl = getMapSpotPinPreviewUrl(pin);
  const title = getMapSpotPinTitle(pin);
  const visitCount = pin.visited_count ?? 0;
  const spotId = normalizePostId(pin.id);
  const spotHref = spotId ? `/posts?id=${encodeURIComponent(spotId)}` : null;

  const thumbnailClassName =
    "relative flex h-20 w-20 shrink-0 touch-manipulation overflow-hidden rounded-full border-[2.5px] border-cyan-400/90 bg-[#0b1026] shadow-[0_0_0_2px_rgba(34,211,238,0.18),0_8px_24px_rgba(0,0,0,0.45),0_0_18px_rgba(34,211,238,0.22)] transition hover:border-cyan-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70";

  const thumbnailContent = previewUrl ? (
    <img src={previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#164e63] to-[#312e81] text-xl">
      📍
    </div>
  );

  const handleMissingSpotId = () => {
    console.warn("[SpotMapPinSheet] missing spotId — cannot open viewer", { pin });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label={t("map.closeSpotDetails")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-map-pin-title"
        className="relative z-10 w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#0a1020]/95 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>

        <div className="flex items-start gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {spotHref ? (
            <Link href={spotHref} className={thumbnailClassName} aria-label={t("map.openSpot")}>
              {thumbnailContent}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleMissingSpotId}
              className={thumbnailClassName}
              aria-label={t("map.openSpot")}
            >
              {thumbnailContent}
            </button>
          )}

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h2 id="spot-map-pin-title" className="truncate text-base font-semibold text-white">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="-mr-1 shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

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
                className="text-xs text-slate-300"
              />
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-slate-400">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/80" aria-hidden />
                <span>{t("map.locationAvailable")}</span>
              </p>
            )}

            <p className="mt-2 text-xs font-medium text-slate-300" aria-label={t("spotStats.visited")}>
              <span aria-hidden>👣</span> {visitCount.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="border-t border-white/8 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {spotHref ? (
            <Link
              href={spotHref}
              className="flex w-full items-center justify-center rounded-full bg-cyan-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-[0.99]"
            >
              {t("map.openSpot")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleMissingSpotId}
              className="flex w-full items-center justify-center rounded-full bg-cyan-500/50 py-3 text-sm font-semibold text-slate-950"
            >
              {t("map.openSpot")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
