"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
import { supabase } from "@/lib/supabaseClient";

type Country = {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
};

export default function RoomsPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCountries = async () => {
      const [
        sessionResult,
        { data, error: countriesError },
      ] = await Promise.all([
        getSafeAuthSession(),
        supabase
          .from("countries")
          .select("id, name, slug, emoji")
          .order("name", { ascending: true }),
      ]);

      const user = sessionResult.session?.user ?? null;
      console.log("channel permission", user ? { id: user.id, temporaryAllowAllLoggedIn: true } : null);

      if (countriesError) {
        console.error("Failed to load rooms countries:", JSON.stringify(countriesError, null, 2));
        setError(countriesError.message || "Unable to load countries.");
        setCountries([]);
      } else {
        setCountries(data ?? []);
        setError(null);
      }

      setLoading(false);
    };

    void loadCountries();
  }, []);

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries]
  );

  return (
    <Shell>
      <div className="space-y-8">
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-xl shadow-black/30">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Rooms</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Choose a country to explore city rooms.</h1>
        </section>

        <Link
          href="/rooms/switzerland/bern?tab=map"
          className="block rounded-3xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 via-slate-900/90 to-slate-950 p-6 shadow-lg shadow-cyan-500/10 transition hover:border-cyan-300/60 hover:from-cyan-500/20"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">New · Bern discovery map</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Open the map — 6 places near Bern</h2>
          <p className="mt-2 text-sm text-slate-300">
            Blausee, Interlaken, Thun, Gurten, Oeschinensee, Lauterbrunnen. Tap a pin for posts.
          </p>
          <span className="mt-4 inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
            Open Bern map
          </span>
        </Link>

        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">Loading countries...</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error}</div>
        ) : sortedCountries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">
            No countries available yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedCountries.map((country) => (
              <Link
                key={country.id}
                href={`/rooms/${country.slug}`}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-cyan-300/40 hover:bg-white/10"
              >
                <div className="text-5xl">{getCountryFlag(country.slug, country.emoji)}</div>
                <div className="mt-4 text-2xl font-semibold text-white">{country.name}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
