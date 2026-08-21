"use client";

import { useState } from "react";
import { LocateFixed, Navigation } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { mapboxStaticPlaceImageUrl } from "@/lib/placeImages";
import { useNavigationAppChooser } from "@/lib/useNavigationAppChooser";

type ChatLocationBubbleProps = {
  latitude: number;
  longitude: number;
  isOwnMessage: boolean;
};

function formatCoordinate(value: number) {
  return value.toFixed(5);
}

/** Renders a one-time current-location snapshot shared in DM/group/City Room chat. */
export default function ChatLocationBubble({ latitude, longitude, isOwnMessage }: ChatLocationBubbleProps) {
  const { t } = useI18n();
  const [mapImageFailed, setMapImageFailed] = useState(false);
  const navigationChooser = useNavigationAppChooser();

  // Static preview image — same Mapbox helper already used for Spot/place cards elsewhere in
  // the app (lib/placeImages.ts). Returns null when no Mapbox token is configured, in which
  // case we fall back to the plain icon tile below rather than a broken <img>.
  const mapPreviewUrl = mapboxStaticPlaceImageUrl(latitude, longitude, 320, 176);

  const openOnMap = () => {
    navigationChooser.open({ latitude, longitude });
  };

  return (
    <div
      className={`w-64 max-w-[85vw] shrink-0 overflow-hidden rounded-2xl ${
        isOwnMessage ? "rounded-br-md" : "rounded-bl-md"
      } bg-[#101a2c] ring-1 ring-white/10`}
    >
      <button type="button" onClick={openOnMap} className="relative block h-28 w-full">
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.18),transparent_65%)]">
          {mapPreviewUrl && !mapImageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mapPreviewUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setMapImageFailed(true)}
            />
          ) : null}
          <span className="relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-cyan-300 shadow-lg shadow-black/40 ring-1 ring-white/15">
            <LocateFixed className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
        </div>
      </button>

      <div className="space-y-2 px-3 py-2.5">
        <span className="text-xs font-semibold text-slate-100">{t("chatAttach.currentLocationLabel")}</span>

        <p className="text-[11px] text-slate-500">
          {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
        </p>

        <button
          type="button"
          onClick={openOnMap}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500/80 to-teal-400/75 px-3 py-2 text-[12px] font-semibold text-slate-950 transition duration-150 hover:from-cyan-400/90 hover:to-teal-300/85 active:scale-[0.98]"
        >
          <Navigation className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          {t("chatAttach.openInMaps")}
        </button>
      </div>

      {navigationChooser.sheet}
    </div>
  );
}
