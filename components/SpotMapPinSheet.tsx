"use client";

import Link from "next/link";
import { MapPin, UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { MapSpotPin } from "@/lib/spots";
import PostCardMedia from "@/components/PostCardMedia";
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label={t("map.closeSpotDetails")} onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold text-white">{pin.spot_name || pin.label}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="px-4 pb-2">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            {pin.media_url || pin.video_cover_url || pin.thumbnail_url ? (
              <PostCardMedia
                post={{
                  media_url: pin.media_url,
                  media_type: pin.media_type,
                  image_url: pin.video_cover_url ?? pin.thumbnail_url,
                  video_cover_url: pin.video_cover_url ?? pin.thumbnail_url,
                  thumbnail_url: pin.thumbnail_url,
                  video_url: pin.media_type === "video" ? pin.media_url : null,
                }}
                className="aspect-[4/5] max-h-[42vh] w-full"
                imageClassName="aspect-[4/5] max-h-[42vh] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/5] max-h-[42vh] w-full items-center justify-center bg-slate-900 text-sm text-slate-500">
                {t("map.noPreview")}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {pin.location_line ? (
            <SpotLocationSummary
              location={{
                content_kind: "spot",
                spot_name: pin.spot_name,
                spot_address: pin.spot_address,
                spot_city: pin.spot_city,
                spot_country: pin.spot_country,
                spot_latitude: pin.latitude,
                spot_longitude: pin.longitude,
              }}
              className="text-xs"
            />
          ) : (
            <p className="flex items-start gap-1.5 text-xs text-slate-400">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t("map.locationAvailable")}</span>
            </p>
          )}

          <Link
            href={`/user?id=${pin.user_id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800">
              <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            </span>
            {pin.username}
          </Link>

          <Link
            href={`/posts?id=${pin.id}`}
            className="flex w-full items-center justify-center rounded-full bg-cyan-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            {t("map.openSpot")}
          </Link>
        </div>
      </div>
    </div>
  );
}
