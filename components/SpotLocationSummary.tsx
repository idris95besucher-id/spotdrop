"use client";

import { useMemo, type MouseEvent } from "react";
import { MapPin } from "lucide-react";
import { useSpotLocationModal } from "@/components/SpotLocationModalProvider";
import {
  formatSpotLocationShort,
  hasSpotLocationData,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";

type SpotLocationSummaryProps = {
  location: SpotLocationDisplayFields;
  className?: string;
};

export default function SpotLocationSummary({ location, className = "" }: SpotLocationSummaryProps) {
  const { openSpotLocation } = useSpotLocationModal();

  const shortLabel = useMemo(() => formatSpotLocationShort(location), [location]);

  if (!hasSpotLocationData(location)) {
    return null;
  }

  const handleSeeSpotClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    openSpotLocation(location);
  };

  return (
    <div
      className={`relative z-30 flex max-w-full items-center gap-2 pointer-events-auto ${className}`}
    >
      <div className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-200/90">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{shortLabel ?? "Location details"}</span>
      </div>
      <button
        type="button"
        onClick={handleSeeSpotClick}
        onPointerDown={(event) => event.stopPropagation()}
        className="relative z-40 shrink-0 cursor-pointer text-xs font-semibold text-primary transition hover:text-cyan-200 active:opacity-80 pointer-events-auto touch-manipulation"
      >
        See Spot
      </button>
    </div>
  );
}
