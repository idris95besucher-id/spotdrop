"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatSpotLocationLabelLocalized } from "@/lib/spotLocationDisplay";
import {
  searchPlaces,
  type PlaceSearchResult,
  type SpotGeoLocation,
} from "@/lib/spotLocation";

export type SpotLocationSourceKind = "device" | "manual" | "media" | "search" | null;

const NO_MEDIA_GPS_MESSAGE = "No saved location found in this media.";

type SpotLocationPickerProps = {
  locating: boolean;
  location: SpotGeoLocation | null;
  locationSource: SpotLocationSourceKind;
  matchedPlaceName: string | null;
  needsLocationChoice: boolean;
  locationHint: string | null;
  disabled?: boolean;
  onUseCurrentLocation: () => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
};

export default function SpotLocationPicker({
  locating,
  location,
  locationSource,
  matchedPlaceName,
  needsLocationChoice,
  locationHint,
  disabled = false,
  onUseCurrentLocation,
  onSelectPlace,
}: SpotLocationPickerProps) {
  const { locale } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    if (!needsLocationChoice) {
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
      setSearchError(null);
    }
  }, [needsLocationChoice]);

  useEffect(() => {
    if (!showSearch) {
      return;
    }

    const trimmed = searchQuery.trim();

    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchLoading(true);
    setSearchError(null);

    const timeoutId = window.setTimeout(() => {
      void searchPlaces(trimmed)
        .then((results) => {
          if (searchRequestRef.current !== requestId) {
            return;
          }

          setSearchResults(results);
          setSearchLoading(false);

          if (results.length === 0) {
            setSearchError("No places found. Try a city or landmark name.");
          }
        })
        .catch((caught) => {
          if (searchRequestRef.current !== requestId) {
            return;
          }

          setSearchResults([]);
          setSearchLoading(false);
          setSearchError(
            caught instanceof Error ? caught.message : "Place search failed. Try again."
          );
        });
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, showSearch]);

  const sourceLabel =
    locationSource === "media"
      ? "Detected from this photo or video"
      : locationSource === "device"
        ? "From your current location"
        : locationSource === "search"
          ? "Selected from search"
          : locationSource === "manual"
            ? "Selected manually"
            : null;

  return (
    <div className="sd-location-block">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        Location
      </p>

      {locating ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
          Reading location from media…
        </div>
      ) : location ? (
        <div className="mt-2">
          <p className="text-sm font-medium leading-snug text-white">{formatSpotLocationLabelLocalized(location, locale)}</p>
          {matchedPlaceName ? (
            <p className="mt-1 text-xs text-accent/90">Near {matchedPlaceName}</p>
          ) : null}
          {sourceLabel ? <p className="mt-1 text-[11px] text-muted">{sourceLabel}</p> : null}
        </div>
      ) : needsLocationChoice ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-snug text-slate-300">{NO_MEDIA_GPS_MESSAGE}</p>

          {locationHint ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              {locationHint}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onUseCurrentLocation}
            disabled={disabled}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-background disabled:opacity-50"
          >
            Use current location
          </button>

          <button
            type="button"
            onClick={() => setShowSearch((current) => !current)}
            disabled={disabled}
            className="w-full rounded-lg border border-white/20 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Search location manually
          </button>

          {showSearch ? (
            <div className="space-y-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search city or place…"
                  disabled={disabled}
                  autoComplete="off"
                  className="sd-input rounded-lg py-2.5 pl-9 pr-3"
                />
              </div>

              {searchLoading ? (
                <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Searching…
                </div>
              ) : null}

              {searchError ? (
                <p className="px-1 text-xs text-amber-200/90">{searchError}</p>
              ) : null}

              {searchResults.length > 0 ? (
                <ul className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-card">
                  {searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelectPlace(result)}
                        className="w-full border-b border-white/5 px-3 py-2.5 text-left text-sm text-white last:border-b-0 hover:bg-white/5 disabled:opacity-50"
                      >
                        <span className="line-clamp-2">{result.label}</span>
                        {result.city || result.country ? (
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {[result.city, result.country].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Add a location to publish this spot.</p>
      )}
    </div>
  );
}
