"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import CityRoomPlacePreview from "@/components/CityRoomPlacePreview";
import { useI18n } from "@/components/I18nProvider";
import {
  buildPlaceMapsUrl,
  parseCityRoomMessageContent,
} from "@/lib/cityRoomPlaceMessage";
import { buildMapPlaceDeepLink } from "@/lib/mapPlaceShare";

type GroupMessagePlaceCardProps = {
  body: string;
  isOwnMessage: boolean;
};

/** Group-chat counterpart of DirectMessagePlaceCard — same encoding, no DM-only read/delivered receipts. */
export default function GroupMessagePlaceCard({ body, isOwnMessage }: GroupMessagePlaceCardProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [opening, setOpening] = useState(false);
  const parsed = parseCityRoomMessageContent(body);
  const place = parsed.kind === "place" ? parsed.place : null;

  const openInSpotDrop = () => {
    if (!place || opening) {
      return;
    }

    setOpening(true);
    router.push(buildMapPlaceDeepLink(place.latitude, place.longitude, place.name));
    setOpening(false);
  };

  if (!place) {
    return (
      <div
        className={`max-w-[85%] rounded-[22px] px-4 py-2.5 shadow-md shadow-black/20 ${
          isOwnMessage
            ? "rounded-br-md bg-primary/20 text-cyan-50"
            : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
        }`}
      >
        <p className="text-sm text-slate-300">{t("map.sharePlace.unavailable")}</p>
      </div>
    );
  }

  const mapsUrl = buildPlaceMapsUrl(place);

  return (
    <div className={`max-w-[85%] ${isOwnMessage ? "rounded-br-md" : "rounded-bl-md"}`}>
      <button
        type="button"
        disabled={opening}
        onClick={openInSpotDrop}
        className="w-full rounded-2xl bg-[#122033]/95 px-3 py-2.5 text-left ring-1 ring-white/8 transition hover:ring-cyan-400/25 disabled:opacity-70"
      >
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
          footer={
            <div className="flex gap-2">
              <span className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary/15 px-3 py-2 text-xs font-semibold text-cyan-200 ring-1 ring-primary/25">
                {opening ? t("map.sharePlace.opening") : t("map.sharePlace.openInSpotDrop")}
              </span>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                {t("map.openInMaps")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          }
        />
      </button>
    </div>
  );
}
