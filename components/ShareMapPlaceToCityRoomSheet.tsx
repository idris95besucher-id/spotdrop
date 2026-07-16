"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, MapPin, Search } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { getCountryFlag } from "@/lib/countryFlags";
import type { CityRoomPlacePayload } from "@/lib/cityRoomPlaceMessage";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { sendMapPlaceToCityRoom } from "@/lib/sendMapPlaceMessage";
import {
  fetchRoomCatalog,
  sortCitiesForCountry,
  type RoomCity,
  type RoomCountry,
} from "@/lib/roomExplore";
import { loadRoomInbox, type RoomInboxRow } from "@/lib/roomMemberships";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type ShareMapPlaceToCityRoomSheetProps = {
  place: CityRoomPlacePayload;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onSent?: () => void;
};

type PickerStep = "rooms" | "countries" | "cities";

export default function ShareMapPlaceToCityRoomSheet({
  place,
  userId,
  isOpen,
  onClose,
  onBack,
  onSent,
}: ShareMapPlaceToCityRoomSheetProps) {
  const { t, locale } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<PickerStep>("rooms");
  const [recentRooms, setRecentRooms] = useState<RoomInboxRow[]>([]);
  const [countries, setCountries] = useState<RoomCountry[]>([]);
  const [cities, setCities] = useState<RoomCity[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<RoomCountry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingRoomKey, setSendingRoomKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep("rooms");
      setSearchQuery("");
      setSelectedCountry(null);
      setError(null);
      setSendingRoomKey(null);
      return;
    }

    setLoading(true);
    setError(null);

    void Promise.all([
      userId ? loadRoomInbox(userId) : Promise.resolve({ rooms: [] as RoomInboxRow[], error: null }),
      fetchRoomCatalog(),
    ]).then(([inboxResult, catalogResult]) => {
      setRecentRooms(inboxResult.rooms);
      setCountries(catalogResult.countries);
      setCities(catalogResult.cities);
      setError(inboxResult.error ?? catalogResult.error);
      setLoading(false);
    });
  }, [isOpen, userId]);

  const sendToRoom = useCallback(
    async (countrySlug: string, citySlug: string) => {
      if (!userId || sendingRoomKey) {
        return;
      }

      const roomKey = `${countrySlug}/${citySlug}`;
      setSendingRoomKey(roomKey);
      setError(null);

      const result = await sendMapPlaceToCityRoom({
        userId,
        countrySlug,
        citySlug,
        place,
      });

      setSendingRoomKey(null);

      if (result.error) {
        setError(result.error);
        return;
      }

      onSent?.();
      onClose();
    },
    [onClose, onSent, place, sendingRoomKey, userId]
  );

  const filteredCountries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query || step !== "countries") {
      return countries;
    }

    return countries.filter((country) => {
      const label = localizeCountryName(locale, { slug: country.slug, name: country.name }).toLowerCase();
      return label.includes(query) || country.slug.includes(query);
    });
  }, [countries, locale, searchQuery, step]);

  const filteredCities = useMemo(() => {
    if (!selectedCountry) {
      return [];
    }

    const sorted = sortCitiesForCountry(selectedCountry, cities);
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return sorted;
    }

    return sorted.filter((city) => {
      const label = localizeCityName(locale, {
        name: city.name,
        slug: city.slug,
        countrySlug: selectedCountry.slug,
      }).toLowerCase();
      return label.includes(query) || city.slug.includes(query);
    });
  }, [cities, locale, searchQuery, selectedCountry]);

  const localizedError = localizeUserMessage(t, error);

  const headerTitle =
    step === "rooms"
      ? t("map.sharePlace.sendToCityRoom")
      : step === "countries"
        ? t("map.sharePlace.chooseCountry")
        : selectedCountry
          ? localizeCountryName(locale, { slug: selectedCountry.slug, name: selectedCountry.name })
          : t("map.sharePlace.chooseCity");

  const handleBack = () => {
    if (step === "cities") {
      setStep("countries");
      setSelectedCountry(null);
      setSearchQuery("");
      return;
    }

    if (step === "countries") {
      setStep("rooms");
      setSearchQuery("");
      return;
    }

    onBack();
  };

  if (!isOpen || !mounted) {
    return null;
  }

  return createPortal(
    <div className={`${bottomSheetLayout.overlay} z-[220]`}>
      <button type="button" className={bottomSheetLayout.backdrop} aria-label={t("common.close")} onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-map-place-room-title"
        data-bottom-sheet-panel
        className={`${bottomSheetLayout.panel} max-w-lg sd-modal-panel`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.back")}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h2 id="share-map-place-room-title" className="truncate text-base font-semibold text-white">
              {headerTitle}
            </h2>
            <p className="truncate text-xs text-slate-400">{place.name}</p>
          </div>
        </div>

        {step !== "rooms" ? (
          <div className="shrink-0 px-4 py-3">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={
                  step === "countries"
                    ? t("map.sharePlace.searchCountries")
                    : t("map.sharePlace.searchCities")
                }
                className="w-full rounded-2xl border border-white/10 bg-[#050816] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/45"
              />
            </label>
          </div>
        ) : null}

        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} px-2 py-2`}>
          {!userId ? (
            <p className="px-3 py-8 text-center text-sm text-muted">{t("map.sharePlace.signIn")}</p>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("map.sharePlace.loadingRooms")}
            </div>
          ) : step === "rooms" ? (
            <div className="space-y-1">
              {recentRooms.length > 0 ? (
                <>
                  <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("map.sharePlace.recentRooms")}
                  </p>
                  {recentRooms.map((room) => {
                    const roomKey = `${room.countrySlug}/${room.citySlug}`;
                    const sending = sendingRoomKey === roomKey;

                    return (
                      <button
                        key={room.membershipId}
                        type="button"
                        disabled={Boolean(sendingRoomKey)}
                        onClick={() => void sendToRoom(room.countrySlug, room.citySlug)}
                        className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <span className="text-xl" aria-hidden>
                          {getCountryFlag(room.countrySlug, null, room.countryCode)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{room.cityName}</span>
                          <span className="block truncate text-xs text-slate-400">{room.countryName}</span>
                        </span>
                        {sending ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </>
              ) : null}

              <button
                type="button"
                onClick={() => setStep("countries")}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                  <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-white">
                  {t("map.sharePlace.browseAllRooms")}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </button>
            </div>
          ) : step === "countries" ? (
            <div className="space-y-1">
              {filteredCountries.map((country) => (
                <button
                  key={country.id}
                  type="button"
                  onClick={() => {
                    setSelectedCountry(country);
                    setStep("cities");
                    setSearchQuery("");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8"
                >
                  <span className="text-xl" aria-hidden>
                    {getCountryFlag(country.slug, country.emoji)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                    {localizeCountryName(locale, { slug: country.slug, name: country.name })}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCities.map((city) => {
                const roomKey = `${selectedCountry?.slug}/${city.slug}`;
                const sending = sendingRoomKey === roomKey;

                return (
                  <button
                    key={city.id}
                    type="button"
                    disabled={Boolean(sendingRoomKey) || !selectedCountry}
                    onClick={() =>
                      selectedCountry ? void sendToRoom(selectedCountry.slug, city.slug) : undefined
                    }
                    className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                      {selectedCountry
                        ? localizeCityName(locale, {
                            name: city.name,
                            slug: city.slug,
                            countrySlug: selectedCountry.slug,
                          })
                        : city.name}
                    </span>
                    {sending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {localizedError ? <p className="px-3 pt-3 text-xs text-red-300">{localizedError}</p> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
