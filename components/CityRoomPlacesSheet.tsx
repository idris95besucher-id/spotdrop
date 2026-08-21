"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import CityRoomPlacePreview from "@/components/CityRoomPlacePreview";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { loadPlacesToVisitForChat, searchPlacesForChat, type PlaceSearchHit } from "@/lib/placeSearchApi";
import { useNavigationAppChooser } from "@/lib/useNavigationAppChooser";

type CityRoomPlacesSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onSendPlace: (place: PlaceSearchHit) => Promise<void> | void;
  scope: {
    countrySlug: string;
    countryName: string;
    citySlug: string;
    cityName: string;
    region?: string | null;
  };
  sending?: boolean;
};

function PlaceResultCard({
  hit,
  sending,
  sendingId,
  onSend,
}: {
  hit: PlaceSearchHit;
  sending: boolean;
  sendingId: string | null;
  onSend: (hit: PlaceSearchHit) => void;
}) {
  const { t } = useI18n();
  const navigationChooser = useNavigationAppChooser();

  return (
    <li className="rounded-2xl border border-white/10 bg-[#050816]/80 p-3">
      <CityRoomPlacePreview
        name={hit.name}
        address={hit.address}
        description={hit.description}
        imageUrl={hit.imageUrl}
        city={hit.city}
        region={hit.region}
        country={hit.country}
        latitude={hit.latitude}
        longitude={hit.longitude}
        compact
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                navigationChooser.open({
                  latitude: hit.latitude,
                  longitude: hit.longitude,
                  label: hit.name,
                  country: hit.country,
                })
              }
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              {t("map.openInMaps")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              disabled={Boolean(sendingId) || sending}
              onClick={() => onSend(hit)}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingId === hit.id ? t("common.sending") : t("rooms.places.sendToChat")}
            </button>
          </div>
        }
      />

      {navigationChooser.sheet}
    </li>
  );
}

export default function CityRoomPlacesSheet({
  isOpen,
  onClose,
  onSendPlace,
  scope,
  sending = false,
}: CityRoomPlacesSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [curatedPlaces, setCuratedPlaces] = useState<PlaceSearchHit[]>([]);
  const [searchResults, setSearchResults] = useState<PlaceSearchHit[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingCurated, setLoadingCurated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length >= 2;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCuratedPlaces([]);
      setSearchResults([]);
      setSearchQuery("");
      setError(null);
      setLoadingCurated(false);
      setSearching(false);
      setSendingId(null);
      setUsingFallback(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setLoadingCurated(true);
    setError(null);

    void loadPlacesToVisitForChat({ ...scope, limit: 24 }).then((response) => {
      setCuratedPlaces(response.results);
      setUsingFallback(response.usingFallback ?? false);
      setError(
        response.error ??
          (response.results.length === 0 ? t("rooms.places.empty", { city: scope.cityName }) : null)
      );
      setLoadingCurated(false);
    });
  }, [isOpen, scope, t]);

  useEffect(() => {
    if (!isOpen || !isSearching) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void searchPlacesForChat({ ...scope, query: trimmedQuery, limit: 12 }).then((response) => {
        setSearchResults(response.results);
        setError(response.error ?? (response.results.length === 0 ? t("rooms.places.searchEmpty") : null));
        setSearching(false);
      });
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, isSearching, scope, t, trimmedQuery]);

  const handleSend = useCallback(
    async (hit: PlaceSearchHit) => {
      if (sending || sendingId) {
        return;
      }

      setSendingId(hit.id);
      setError(null);

      try {
        await onSendPlace(hit);
        onClose();
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Unable to send your message.";
        setError(message);
      } finally {
        setSendingId(null);
      }
    },
    [onClose, onSendPlace, sending, sendingId]
  );

  const localizedError = useMemo(() => {
    if (!error) {
      return null;
    }

    return localizeUserMessage(t, error) ?? error;
  }, [error, t]);

  const emptyCuratedMessage = t("rooms.places.empty", { city: scope.cityName });

  if (!isOpen || !mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-room-places-title"
        className="relative z-10 flex max-h-[min(88vh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="shrink-0 border-b border-white/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="city-room-places-title" className="text-base font-semibold leading-snug text-white sm:text-lg">
                {t("rooms.create.shareSpot")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">{scope.cityName}</p>
              {usingFallback && !isSearching ? (
                <p className="mt-1 text-xs text-slate-500">
                  {t("rooms.places.topAttractions", { city: scope.cityName })}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-white"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <label className="relative mt-3 block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("rooms.places.searchPlaceholder")}
              className="w-full rounded-2xl border border-white/10 bg-[#050816] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/45"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
          {isSearching ? (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("rooms.places.searchResults")}
              </h3>
              {searching ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("rooms.places.searching")}
                </div>
              ) : searchResults.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">{localizedError ?? t("rooms.places.searchEmpty")}</p>
              ) : (
                <ul className="space-y-3 pb-1">
                  {searchResults.map((hit) => (
                    <PlaceResultCard
                      key={`search-${hit.id}`}
                      hit={hit}
                      sending={sending}
                      sendingId={sendingId}
                      onSend={(place) => void handleSend(place)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("rooms.places.placesToVisit", { city: scope.cityName })}
              </h3>
              {loadingCurated ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("rooms.places.loading")}
                </div>
              ) : curatedPlaces.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">{localizedError ?? emptyCuratedMessage}</p>
              ) : (
                <ul className="space-y-3 pb-1">
                  {curatedPlaces.map((hit) => (
                    <PlaceResultCard
                      key={`curated-${hit.id}`}
                      hit={hit}
                      sending={sending}
                      sendingId={sendingId}
                      onSend={(place) => void handleSend(place)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {localizedError && (isSearching ? searchResults.length > 0 : curatedPlaces.length > 0) ? (
            <p className="mt-3 text-xs text-red-300">{localizedError}</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
