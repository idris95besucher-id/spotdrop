"use client";

import type { ReactNode } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { buildPlaceMapsUrl } from "@/lib/cityRoomPlaceMessage";
import { formatCityRegionLabel, formatPlaceLocationLabel } from "@/lib/touristPlaceSearch";

type CityRoomPlacePreviewProps = {
  name: string;
  address: string;
  description: string | null;
  imageUrl?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude: number;
  longitude: number;
  mapsUrl?: string;
  footer?: ReactNode;
  compact?: boolean;
};

export default function CityRoomPlacePreview({
  name,
  address,
  description,
  imageUrl,
  city = null,
  region = null,
  country = null,
  latitude,
  longitude,
  mapsUrl,
  footer = null,
  compact = false,
}: CityRoomPlacePreviewProps) {
  const cityRegion =
    formatPlaceLocationLabel(city, region, country) ?? formatCityRegionLabel(city, region);
  const resolvedMapsUrl = mapsUrl ?? buildPlaceMapsUrl({ name, latitude, longitude });

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {imageUrl ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            className={`w-full object-cover ${compact ? "h-28" : "h-32 sm:h-36"}`}
          />
        </div>
      ) : (
        <div
          className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 ring-1 ring-white/10 ${
            compact ? "h-28" : "h-32 sm:h-36"
          }`}
        >
          <MapPin className="h-8 w-8 text-cyan-400/70" aria-hidden />
        </div>
      )}

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{name}</p>
        {cityRegion ? (
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-cyan-300/80">{cityRegion}</p>
        ) : null}
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
        ) : null}
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{address}</p>
      </div>

      {footer ?? (
        <a
          href={resolvedMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Open in Maps
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}
