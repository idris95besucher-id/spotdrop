"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
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

export default function CountryRoomsPage() {
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
      console.log("channel permission", user ? { id: user.id, createOnCityRoomPage: true } : null);

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

    return [...cities]
      .filter((city) => city.country_id === foundCountry.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cities, foundCountry]);

  useEffect(() => {
    if (loading) {
      return;
    }

    console.log("params.country:", params.country);
    console.log("found country:", foundCountry);
    console.log("cities count:", sortedCities.length);
  }, [params.country, foundCountry, sortedCities.length, loading]);

  if (!countrySlug) {
    return (
      <Shell>
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-slate-300">
          <p className="text-lg font-semibold text-white">Invalid country.</p>
          <p className="mt-3 text-slate-400">Please select a valid country from the rooms list.</p>
          <Link href="/rooms" className="mt-6 inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
            Back to countries
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-8">
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-xl shadow-black/30">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Rooms</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            {foundCountry ? (
              <div className="text-4xl">{getCountryFlag(foundCountry.slug, foundCountry.emoji, foundCountry.code)}</div>
            ) : null}
            <h1 className="text-4xl font-semibold text-white">{foundCountry?.name ?? "Country"}</h1>
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">Loading cities...</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error}</div>
        ) : !foundCountry ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
            <p className="text-base">Invalid country.</p>
            <p className="mt-4 text-sm text-slate-400">Please select a valid country from the rooms list.</p>
            <Link href="/rooms" className="mt-6 inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Back to countries
            </Link>
          </div>
        ) : sortedCities.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedCities.map((city) => (
              <Link
                key={city.id}
                href={
                  countrySlug === "switzerland" && city.slug === "bern"
                    ? `/rooms/${countrySlug}/${city.slug}?tab=map`
                    : `/rooms/${countrySlug}/${city.slug}`
                }
                className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-cyan-300/40 hover:bg-white/10"
              >
                <div className="text-2xl font-semibold text-white">{city.name}</div>
                {countrySlug === "switzerland" && city.slug === "bern" ? (
                  <p className="mt-2 text-sm font-medium text-cyan-300">Discovery map · 6 places</p>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-300">
            <p className="text-base">No cities found for {foundCountry.name}.</p>
            <p className="mt-4 text-sm text-slate-400">Return to the rooms list and choose another country.</p>
            <Link href="/rooms" className="mt-6 inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Back to countries
            </Link>
          </div>
        )}
      </div>
    </Shell>
  );
}
