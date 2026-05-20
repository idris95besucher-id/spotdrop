"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, MapPin, Mountain } from "lucide-react";
import {
  BERN_MAP_BOUNDS,
  DISCOVERY_CATEGORY_COLORS,
  DISCOVERY_CATEGORY_LABELS,
  getBernDiscoveryPlacesInstant,
  projectLatLngToPercent,
  type DiscoveryPlace,
  type DiscoveryPlaceCategory,
  type DiscoveryRegion,
} from "@/lib/discoveryMap";
import { loadBernDiscoveryRegion, loadDiscoveryPlaces } from "@/lib/discoveryPlaces";
import DiscoveryPlaceDetail from "@/components/DiscoveryPlaceDetail";

type BernDiscoveryMapProps = {
  userId: string | null;
};

const INSTANT_PLACES = getBernDiscoveryPlacesInstant();

export default function BernDiscoveryMap({ userId }: BernDiscoveryMapProps) {
  const [region, setRegion] = useState<DiscoveryRegion | null>({
    id: "fallback-region",
    country_slug: "switzerland",
    slug: "bern-area",
    name: "Bern & Oberland",
    city_slug: "bern",
    map_bounds_north: BERN_MAP_BOUNDS.north,
    map_bounds_south: BERN_MAP_BOUNDS.south,
    map_bounds_east: BERN_MAP_BOUNDS.east,
    map_bounds_west: BERN_MAP_BOUNDS.west,
  });
  const [places, setPlaces] = useState<DiscoveryPlace[]>(INSTANT_PLACES);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<DiscoveryPlaceCategory | "all">("all");
  const [selectedPlace, setSelectedPlace] = useState<DiscoveryPlace | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setSyncing(true);
      setError(null);

      const regionResult = await loadBernDiscoveryRegion();

      if (cancelled) {
        return;
      }

      const placesResult = await loadDiscoveryPlaces(regionResult.region.id, regionResult.usingFallback);

      if (cancelled) {
        return;
      }

      setRegion(regionResult.region);
      if (placesResult.places.length > 0) {
        setPlaces(placesResult.places);
      }
      setError(regionResult.error ?? placesResult.error);
      setSyncing(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const bounds = useMemo(
    () =>
      region
        ? {
            north: region.map_bounds_north,
            south: region.map_bounds_south,
            east: region.map_bounds_east,
            west: region.map_bounds_west,
          }
        : BERN_MAP_BOUNDS,
    [region]
  );

  const filteredPlaces = useMemo(() => {
    if (activeCategory === "all") {
      return places;
    }

    return places.filter((place) => place.category === activeCategory);
  }, [activeCategory, places]);

  const categories = useMemo(() => {
    const unique = new Set(places.map((place) => place.category));
    return Array.from(unique) as DiscoveryPlaceCategory[];
  }, [places]);

  return (
    <div className="relative z-10 flex w-full min-h-[520px] flex-col">
      <div className="shrink-0 border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">Bern discovery map</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{region?.name ?? "Bern & Oberland"}</h2>
            <p className="mt-1 text-xs text-slate-400">Tap a pin or card to open place details.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Places</p>
            <p className="text-lg font-semibold tabular-nums text-white">{places.length}</p>
            {syncing ? <p className="text-[10px] text-cyan-300/80">Syncing…</p> : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              activeCategory === "all"
                ? "bg-cyan-400 text-slate-950"
                : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden />
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === category
                  ? "bg-cyan-400 text-slate-950"
                  : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${DISCOVERY_CATEGORY_COLORS[category]}`} aria-hidden />
              {DISCOVERY_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
      </div>

      {/* Fixed-height map canvas — always visible */}
      <div className="relative h-[500px] w-full shrink-0 overflow-hidden border-b border-white/10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.12),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(16,185,129,0.08),transparent_40%)]" />
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="absolute inset-4 rounded-[2rem] border border-cyan-400/20 bg-slate-900/50 shadow-inner shadow-black/50">
          <p className="absolute left-5 top-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/90">
            Bern & Oberland · Discovery map
          </p>
          <div className="absolute inset-x-8 top-[22%] h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
          <div className="absolute inset-x-10 top-[48%] h-px bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" />
          <div className="absolute inset-x-12 top-[72%] h-px bg-gradient-to-r from-transparent via-emerald-300/20 to-transparent" />
          <Mountain
            className="pointer-events-none absolute bottom-10 left-1/2 h-14 w-14 -translate-x-1/2 text-slate-600/90"
            strokeWidth={1}
            aria-hidden
          />
        </div>

        {filteredPlaces.map((place) => {
          const position = projectLatLngToPercent(place.latitude, place.longitude, bounds);
          const isSelected = selectedPlace?.id === place.id;

          return (
            <button
              key={place.id}
              type="button"
              onClick={() => setSelectedPlace(place)}
              className="group absolute z-20 -translate-x-1/2 -translate-y-full transition hover:z-30 focus:z-30 focus:outline-none"
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              aria-label={`Open ${place.name}`}
            >
              <span
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 shadow-lg shadow-black/50 transition group-hover:scale-110 ${
                  isSelected
                    ? "border-cyan-200 bg-cyan-400 text-slate-950"
                    : "border-white/30 bg-slate-900 text-cyan-200 group-hover:border-cyan-300"
                }`}
              >
                <MapPin className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </span>
              <span
                className={`mt-1.5 block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold shadow-md ${
                  isSelected
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-white/15 bg-slate-950/95 text-white"
                }`}
              >
                {place.name}
              </span>
            </button>
          );
        })}

        {error ? (
          <p className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {error} Showing built-in Bern places.
          </p>
        ) : null}
      </div>

      <div className="shrink-0 bg-slate-950/90 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Places near Bern</p>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filteredPlaces.map((place) => (
            <button
              key={`card-${place.id}`}
              type="button"
              onClick={() => setSelectedPlace(place)}
              className="min-w-[148px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left transition hover:border-cyan-300/40 hover:bg-white/[0.08]"
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${DISCOVERY_CATEGORY_COLORS[place.category]}`}
                aria-hidden
              />
              <p className="mt-2 text-sm font-semibold text-white">{place.name}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                {place.short_description ?? DISCOVERY_CATEGORY_LABELS[place.category]}
              </p>
            </button>
          ))}
        </div>
      </div>

      {selectedPlace ? (
        <DiscoveryPlaceDetail place={selectedPlace} userId={userId} onClose={() => setSelectedPlace(null)} />
      ) : null}
    </div>
  );
}
