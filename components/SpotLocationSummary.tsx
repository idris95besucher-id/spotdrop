"use client";

import { useMemo, type MouseEvent } from "react";
import { MapPin } from "lucide-react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { useSpotLocationModal } from "@/components/SpotLocationModalProvider";
import {
  formatSpotLocationShortLocalized,
  hasSpotLocationData,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";
import { seeSpotLocation } from "@/lib/seeSpotLocation";

type SpotLocationSummaryProps = {
  location: SpotLocationDisplayFields;
  className?: string;
  currentVisitedCount?: number;
};

export default function SpotLocationSummary({
  location,
  className = "",
  currentVisitedCount,
}: SpotLocationSummaryProps) {
  const { openSpotLocation } = useSpotLocationModal();
  const { session, loading } = useAuthSession();
  const { t, locale } = useI18n();
  const viewerId = session?.user?.id ?? null;

  const shortLabel = useMemo(
    () => formatSpotLocationShortLocalized(location, locale),
    [location, locale]
  );

  if (!hasSpotLocationData(location)) {
    return null;
  }

  const handleSeeSpotClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();

    seeSpotLocation({
      location,
      viewerId,
      ownerId: location.user_id ?? null,
      authResolved: !loading,
      currentVisitedCount,
      openSpotLocation,
    });
  };

  return (
    <div
      className={`relative z-30 flex max-w-full items-center gap-2 pointer-events-auto ${className}`}
    >
      <div className="inline-flex min-w-0 items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-400" strokeWidth={1.75} aria-hidden />
        <span className="truncate text-sm font-semibold text-white">
          {shortLabel ?? t("spotEditor.addLocation")}
        </span>
      </div>
      <button
        type="button"
        onClick={handleSeeSpotClick}
        onPointerDown={(event) => event.stopPropagation()}
        className="relative z-40 shrink-0 cursor-pointer text-xs font-semibold text-primary transition hover:text-cyan-200 active:opacity-80 pointer-events-auto touch-manipulation"
      >
        {t("spotLocation.seeSpot")}
      </button>
    </div>
  );
}
