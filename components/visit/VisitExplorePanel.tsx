"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
import { localizeCountryName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { MOBILE_PANEL_SCROLL_CLASS } from "@/lib/mobileLayout";
import { fetchRoomCountries, type RoomCountry } from "@/lib/roomExplore";

type VisitExplorePanelProps = {
  onSelectCountry?: (country: RoomCountry) => void;
  showHeader?: boolean;
};

export default function VisitExplorePanel({
  onSelectCountry,
  showHeader = true,
}: VisitExplorePanelProps = {}) {
  const { t, locale } = useI18n();
  const [countries, setCountries] = useState<RoomCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCountries = async () => {
      const [sessionResult, countriesResult] = await Promise.all([
        getSafeAuthSession(),
        fetchRoomCountries(),
      ]);

      const user = sessionResult.session?.user ?? null;
      console.log("channel permission", user ? { id: user.id, temporaryAllowAllLoggedIn: true } : null);

      if (countriesResult.error) {
        console.error("Failed to load visit countries:", countriesResult.error);
        setError(countriesResult.error || t("rooms.error.loadCountries"));
        setCountries([]);
      } else {
        setCountries(countriesResult.countries);
        setError(null);
      }

      setLoading(false);
    };

    void loadCountries();
  }, [t]);

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries]
  );

  const localizedError = localizeUserMessage(t, error);

  return (
    <div data-mobile-panel-scroll="" className={`${MOBILE_PANEL_SCROLL_CLASS} select-none touch-manipulation`}>
      <div className="space-y-3 px-4 py-3 sm:px-5">
        {showHeader ? (
          <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-center">
            <h1 className="text-base font-semibold tracking-[-0.01em] text-white sm:text-[17px]">
              {t("visit.exploreRoomsTitle")}
            </h1>
          </section>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">
            {t("rooms.loadingCountries")}
          </div>
        ) : localizedError ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{localizedError}</div>
        ) : sortedCountries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">
            {t("rooms.noCountries")}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {sortedCountries.map((country) => {
              const label = localizeCountryName(locale, { slug: country.slug, name: country.name });

              if (onSelectCountry) {
                return (
                  <button
                    key={country.id}
                    type="button"
                    onClick={() => onSelectCountry(country)}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-cyan-300/40 hover:bg-white/10 sm:p-6"
                  >
                    <div className="text-4xl sm:text-5xl">{getCountryFlag(country.slug, country.emoji)}</div>
                    <div className="mt-3 text-xl font-semibold text-white sm:text-2xl">{label}</div>
                  </button>
                );
              }

              return (
                <Link
                  key={country.id}
                  href={`/visit/${country.slug}`}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-300/40 hover:bg-white/10 sm:p-6"
                >
                  <div className="text-4xl sm:text-5xl">{getCountryFlag(country.slug, country.emoji)}</div>
                  <div className="mt-3 text-xl font-semibold text-white sm:text-2xl">{label}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
