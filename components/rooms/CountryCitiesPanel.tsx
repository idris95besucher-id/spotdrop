"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { getCountryFlag } from "@/lib/countryFlags";
import { localizeCityName, localizeCountryName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  fetchRoomCatalog,
  sortCitiesForCountry,
  type RoomCity,
  type RoomCountry,
} from "@/lib/roomExplore";

type CountryCitiesPanelProps = {
  countrySlug: string;
  onSelectCity?: (city: RoomCity, country: RoomCountry) => void;
  onCountryResolved?: (country: RoomCountry | null) => void;
  showCountryHeader?: boolean;
};

export default function CountryCitiesPanel({
  countrySlug,
  onSelectCity,
  onCountryResolved,
  showCountryHeader = true,
}: CountryCitiesPanelProps) {
  const { t, locale } = useI18n();
  const [countries, setCountries] = useState<RoomCountry[]>([]);
  const [cities, setCities] = useState<RoomCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    void fetchRoomCatalog().then((result) => {
      if (cancelled) {
        return;
      }

      setCountries(result.countries);
      setCities(result.cities);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const foundCountry = useMemo(
    () => countries.find((country) => country.slug === countrySlug) ?? null,
    [countries, countrySlug]
  );

  const sortedCities = useMemo(() => {
    if (!foundCountry) {
      return [];
    }

    return sortCitiesForCountry(foundCountry, cities);
  }, [cities, foundCountry]);

  const localizedError = localizeUserMessage(t, error);
  const localizedCountryName = foundCountry
    ? localizeCountryName(locale, { slug: foundCountry.slug, name: foundCountry.name })
    : null;

  useEffect(() => {
    if (!loading) {
      onCountryResolved?.(foundCountry);
    }
  }, [foundCountry, loading, onCountryResolved]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">
        {t("rooms.loadingCities")}
      </div>
    );
  }

  if (localizedError) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{localizedError}</div>
    );
  }

  if (!foundCountry) {
    return (
      <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-slate-300">
        <p className="text-lg font-semibold text-white">{t("rooms.invalidCountry")}</p>
        <p className="mt-3 text-slate-400">{t("rooms.selectValidCountry")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showCountryHeader ? (
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 text-center shadow-xl shadow-black/30 sm:p-8">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">{t("rooms.title")}</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="text-4xl">{getCountryFlag(foundCountry.slug, foundCountry.emoji)}</div>
            <h2 className="text-2xl font-semibold text-white sm:text-4xl">{localizedCountryName}</h2>
          </div>
        </section>
      ) : null}

      {sortedCities.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {sortedCities.map((city) => {
            const label = localizeCityName(locale, {
              slug: city.slug,
              name: city.name,
              countrySlug,
            });

            if (onSelectCity) {
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => onSelectCity(city, foundCountry)}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-cyan-300/40 hover:bg-white/10 sm:p-6"
                >
                  <div className="text-xl font-semibold text-white sm:text-2xl">{label}</div>
                </button>
              );
            }

            return (
              <Link
                key={city.id}
                href={`/visit/${countrySlug}/${city.slug}`}
                className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-300/40 hover:bg-white/10 sm:p-6"
              >
                <div className="text-xl font-semibold text-white sm:text-2xl">{label}</div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
          <p className="text-base">{t("rooms.noCities", { name: localizedCountryName ?? foundCountry.name })}</p>
        </div>
      )}
    </div>
  );
}
