"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  filterRussiaRoomPickerCities,
  RUSSIA_COUNTRY_SLUG,
} from "@/lib/russiaRoomPicker";
import {
  filterSwitzerlandRoomPickerCities,
  SWITZERLAND_COUNTRY_SLUG,
} from "@/lib/switzerlandRoomPicker";
import { supabase } from "@/lib/supabaseClient";

type Country = {
  id: string;
  name: string;
  slug: string;
  code?: string | null;
  emoji: string | null;
};

type City = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

function InvalidCountryPanel({ t }: { t: ReturnType<typeof useI18n>["t"] }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-slate-300">
      <p className="text-lg font-semibold text-white">{t("rooms.invalidCountry")}</p>
      <p className="mt-3 text-slate-400">{t("rooms.selectValidCountry")}</p>
      <Link href="/visit" className="mt-6 inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
        {t("rooms.backToCountries")}
      </Link>
    </div>
  );
}

export default function CountryRoomsPage() {
  const { t, locale } = useI18n();
  const params = useParams<{ country: string }>();
  const countrySlug = String(params.country ?? "").toLowerCase();
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRoomData = async () => {
      const [
        sessionResult,
        { data: countriesData, error: countriesError },
        { data: citiesData, error: citiesError },
      ] = await Promise.all([
        getSafeAuthSession(),
        supabase.from("countries").select("id, name, slug, emoji").order("name", { ascending: true }),
        supabase.from("cities").select("id, name, slug, country_id").order("name", { ascending: true }),
      ]);

      const user = sessionResult.session?.user ?? null;
      console.log("[Rooms auth] country page", {
        sessionLoaded: !sessionResult.error,
        loggedIn: Boolean(user),
        expired: sessionResult.expired,
        path: window.location.pathname,
      });
      console.log("[Rooms route] country params", {
        rawParam: params.country,
        countrySlug,
      });

      if (countriesError) {
        console.error("Failed to load country data:", countriesError);
        setError(countriesError.message);
        setLoading(false);
        return;
      }

      if (citiesError) {
        console.error("Failed to load city data:", citiesError);
        setError(citiesError.message);
        setLoading(false);
        return;
      }

      setCountries(countriesData ?? []);
      setCities(citiesData ?? []);
      setLoading(false);
    };

    void loadRoomData();
  }, []);

  const foundCountry = useMemo(
    () => countries.find((country) => country.slug === countrySlug) ?? null,
    [countries, countrySlug]
  );

  const sortedCities = useMemo(() => {
    if (!foundCountry) {
      return [];
    }

    const countryCities = cities
      .filter((city) => city.country_id === foundCountry.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (countrySlug === SWITZERLAND_COUNTRY_SLUG) {
      return filterSwitzerlandRoomPickerCities(countryCities);
    }

    if (countrySlug === RUSSIA_COUNTRY_SLUG) {
      return filterRussiaRoomPickerCities(countryCities);
    }

    return countryCities;
  }, [cities, foundCountry, countrySlug]);

  useEffect(() => {
    if (loading) {
      return;
    }

    console.log("[Rooms route] country resolved", {
      param: params.country,
      slug: countrySlug,
      found: foundCountry?.name ?? "NOT FOUND — check DB slug",
      citiesCount: sortedCities.length,
    });
  }, [params.country, countrySlug, foundCountry, sortedCities.length, loading]);

  const localizedError = localizeUserMessage(t, error);

  const localizedCountryName = foundCountry
    ? localizeCountryName(locale, { slug: foundCountry.slug, name: foundCountry.name })
    : null;

  if (!countrySlug) {
    return (
      <Shell showHeader={false} flushTop>
        <InvalidCountryPanel t={t} />
      </Shell>
    );
  }

  return (
    <Shell showHeader={false} flushTop>
      <div className={`flex min-h-0 flex-1 flex-col ${MOBILE_WIDTH_SAFE_CLASS}`}>
        <MobileSecondaryHeader title={localizedCountryName ?? t("rooms.cities")} backHref="/visit" />
        <div className="space-y-8 px-4 py-6 sm:px-0">
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-xl shadow-black/30">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">{t("rooms.title")}</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            {foundCountry ? (
              <div className="text-4xl">{getCountryFlag(foundCountry.slug, foundCountry.emoji, foundCountry.code)}</div>
            ) : null}
            <h1 className="text-4xl font-semibold text-white">{localizedCountryName ?? t("rooms.country")}</h1>
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">
            {t("rooms.loadingCities")}
          </div>
        ) : localizedError ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{localizedError}</div>
        ) : !foundCountry ? (
          <InvalidCountryPanel t={t} />
        ) : sortedCities.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedCities.map((city) => (
              <Link
                key={city.id}
                href={`/rooms/${countrySlug}/${city.slug}`}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-cyan-300/40 hover:bg-white/10"
              >
                <div className="text-2xl font-semibold text-white">
                  {localizeCityName(locale, {
                    slug: city.slug,
                    name: city.name,
                    countrySlug,
                  })}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
            <p className="text-base">{t("rooms.noCities", { name: localizedCountryName ?? foundCountry.name })}</p>
            <p className="mt-4 text-sm text-slate-400">{t("rooms.returnToList")}</p>
            <Link href="/visit" className="mt-6 inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              {t("rooms.backToCountries")}
            </Link>
          </div>
        )}
        </div>
      </div>
    </Shell>
  );
}
