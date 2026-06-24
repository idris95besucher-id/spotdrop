"use client";

import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { MapPin } from "lucide-react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { useSpotLocationModal } from "@/components/SpotLocationModalProvider";
import {
  formatSpotLocationShortLocalized,
  hasSpotLocationData,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";
import { recordSpotSeeVisit } from "@/lib/spotRanking";
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
  const pendingSeeSpotRef = useRef(false);

  const shortLabel = useMemo(
    () => formatSpotLocationShortLocalized(location, locale),
    [location, locale]
  );

  useEffect(() => {
    if (!pendingSeeSpotRef.current || loading || !viewerId || !location.id) {
      return;
    }

    pendingSeeSpotRef.current = false;
    void recordSpotSeeVisit({
      postId: location.id,
      viewerId,
      ownerId: location.user_id ?? null,
      authResolved: true,
      currentVisitedCount,
    });
  }, [loading, viewerId, location.id, location.user_id, currentVisitedCount]);

  if (!hasSpotLocationData(location)) {
    return null;
  }

  const handleSeeSpotClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();

    if (!viewerId || loading) {
      pendingSeeSpotRef.current = true;
    }

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
      <div className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-200/90">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{shortLabel ?? t("spotEditor.addLocation")}</span>
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
