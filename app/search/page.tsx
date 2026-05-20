"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { UserRound } from "lucide-react";
import OfficialAIGuideBadge from "@/components/OfficialAIGuideBadge";
import Shell from "@/components/Shell";
import { getCountryFlag } from "@/lib/countryFlags";
import { publicProfileUsername, sanitizePublicProfiles } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

type Country = {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
};

type City = {
  id: string;
  name: string;
  country_id: string;
};

type SearchProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  country_slug?: string | null;
  city_id?: string | null;
  date_of_birth?: string | null;
  is_online?: boolean | null;
  is_ai_guide?: boolean | null;
  is_official?: boolean | null;
};

const PROFILE_SELECT = "id, username, avatar_url, country_slug, city_id, date_of_birth, is_online, is_ai_guide, is_official";
const PROFILE_SELECT_LEGACY = "id, username, avatar_url, country_slug, city_id, date_of_birth, is_online";

function calculateAge(dateOfBirth: string | null | undefined) {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(dateOfBirth);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
}

export default function SearchPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [allProfiles, setAllProfiles] = useState<SearchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [usernameInput, setUsernameInput] = useState("");
  const [activeUsernameQuery, setActiveUsernameQuery] = useState("");

  const [filterCountryInput, setFilterCountryInput] = useState("");
  const [filterCityInput, setFilterCityInput] = useState("");
  const [minAgeInput, setMinAgeInput] = useState("18");
  const [maxAgeInput, setMaxAgeInput] = useState("99");
  const [onlineOnlyInput, setOnlineOnlyInput] = useState(false);

  const [appliedCountrySlug, setAppliedCountrySlug] = useState("");
  const [appliedCityId, setAppliedCityId] = useState("");
  const [appliedMinAge, setAppliedMinAge] = useState("");
  const [appliedMaxAge, setAppliedMaxAge] = useState("99");
  const [appliedOnlineOnly, setAppliedOnlineOnly] = useState(false);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);

  useEffect(() => {
    const loadPageData = async () => {
      setLoading(true);
      setLoadError(null);

      const profilesResult = await supabase.from("profiles").select(PROFILE_SELECT).order("username", { ascending: true });
      const profilesWithFallback =
        profilesResult.error?.code === "42703"
          ? await supabase.from("profiles").select(PROFILE_SELECT_LEGACY).order("username", { ascending: true })
          : profilesResult;

      const [
        { data: countriesData, error: countriesError },
        { data: citiesData, error: citiesError },
        { data: profilesData, error: profilesError },
      ] = await Promise.all([
        supabase.from("countries").select("id, name, slug, emoji").order("name", { ascending: true }),
        supabase.from("cities").select("id, name, country_id").order("name", { ascending: true }),
        profilesWithFallback,
      ]);

      if (countriesError) {
        console.error("Failed to load search countries:", JSON.stringify(countriesError, null, 2));
        setLoadError(countriesError.message || "Unable to load countries.");
        setCountries([]);
      } else {
        setCountries(countriesData ?? []);
      }

      if (citiesError) {
        console.error("Failed to load search cities:", JSON.stringify(citiesError, null, 2));
        setLoadError((current) => current ?? citiesError.message ?? "Unable to load cities.");
        setCities([]);
      } else {
        setCities(citiesData ?? []);
      }

      if (profilesError) {
        console.error("Failed to load search profiles:", JSON.stringify(profilesError, null, 2));
        setLoadError((current) => current ?? profilesError.message ?? "Unable to load users.");
        setAllProfiles([]);
      } else {
        setAllProfiles(sanitizePublicProfiles(profilesData ?? []));
      }

      setLoading(false);
    };

    void loadPageData();
  }, []);

  const selectedCountry = useMemo(
    () => countries.find((country) => country.slug === filterCountryInput) ?? null,
    [countries, filterCountryInput]
  );

  const availableCities = useMemo(() => {
    if (!selectedCountry) {
      return [];
    }

    return cities.filter((city) => city.country_id === selectedCountry.id);
  }, [cities, selectedCountry]);

  const cityNameById = useMemo(() => new Map(cities.map((city) => [city.id, city.name])), [cities]);

  const displayedProfiles = useMemo(() => {
    let list = allProfiles;

    if (activeUsernameQuery) {
      const query = activeUsernameQuery.toLowerCase();
      list = list.filter((profile) => profile.username.toLowerCase().includes(query));
    }

    if (hasAppliedFilters) {
      if (appliedCountrySlug) {
        list = list.filter((profile) => profile.country_slug === appliedCountrySlug);
      }

      if (appliedCityId) {
        list = list.filter((profile) => profile.city_id === appliedCityId);
      }

      if (appliedOnlineOnly) {
        list = list.filter((profile) => profile.is_online === true);
      }

      const minAgeNumber = appliedMinAge ? Number(appliedMinAge) : null;
      const maxAgeNumber = appliedMaxAge ? Number(appliedMaxAge) : 99;
      const hasActiveAgeFilter = appliedMinAge !== "18" || appliedMaxAge !== "99";

      if (hasActiveAgeFilter) {
        list = list.filter((profile) => {
          const age = calculateAge(profile.date_of_birth);

          if (minAgeNumber !== null && Number.isFinite(minAgeNumber)) {
            if (age === null || age < minAgeNumber) {
              return false;
            }
          }

          if (maxAgeNumber !== null && Number.isFinite(maxAgeNumber)) {
            if (age === null || age > maxAgeNumber) {
              return false;
            }
          }

          return true;
        });
      }
    }

    return list;
  }, [
    allProfiles,
    activeUsernameQuery,
    hasAppliedFilters,
    appliedCountrySlug,
    appliedCityId,
    appliedMinAge,
    appliedMaxAge,
    appliedOnlineOnly,
  ]);

  const handleUsernameSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActiveUsernameQuery(usernameInput.trim());
  };

  const handleFilterSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedCountrySlug(filterCountryInput);
    setAppliedCityId(filterCityInput);
    setAppliedMinAge(minAgeInput || "18");
    setAppliedMaxAge(maxAgeInput || "99");
    setAppliedOnlineOnly(onlineOnlyInput);
    setHasAppliedFilters(true);
  };

  const clearUsernameSearch = () => {
    setUsernameInput("");
    setActiveUsernameQuery("");
  };

  const clearFilters = () => {
    setFilterCountryInput("");
    setFilterCityInput("");
    setMinAgeInput("18");
    setMaxAgeInput("99");
    setOnlineOnlyInput(false);
    setAppliedCountrySlug("");
    setAppliedCityId("");
    setAppliedMinAge("18");
    setAppliedMaxAge("99");
    setAppliedOnlineOnly(false);
    setHasAppliedFilters(false);
  };

  const renderLoadingCards = () => (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={`loading-card-${index}`}
          className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-5"
        >
          <div className="flex animate-pulse items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-800" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-32 rounded-full bg-slate-800" />
              <div className="h-3 w-24 rounded-full bg-slate-800/80" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderUserCard = (profile: SearchProfile) => {
    const country = countries.find((item) => item.slug === profile.country_slug) ?? null;
    const cityName = cityNameById.get(profile.city_id ?? "") ?? null;
    const isOfficialAIGuide = Boolean(profile.is_ai_guide && profile.is_official);
    const location = country
      ? `${getCountryFlag(country.slug, country.emoji)} ${cityName ? `${cityName}, ` : ""}${country.name}`
      : cityName ?? null;

    return (
      <Link
        key={profile.id}
        href={`/user/${profile.id}`}
        className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-950/95 p-5 shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:shadow-cyan-950/30"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/0 via-cyan-400/0 to-cyan-400/0 opacity-0 transition group-hover:opacity-100 group-hover:from-cyan-400/5 group-hover:to-indigo-400/5" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-xl font-semibold text-white shadow-md shadow-black/30">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-7 w-7 text-slate-400" strokeWidth={1.5} aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-white">{publicProfileUsername(profile.username)}</h2>
              {isOfficialAIGuide ? <OfficialAIGuideBadge /> : null}
              {profile.is_online ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Online
                </span>
              ) : null}
            </div>
            {location ? <p className="mt-3 text-sm text-slate-300">{location}</p> : null}
            <p className="mt-4 text-sm font-medium text-cyan-300 transition group-hover:text-cyan-200">View profile</p>
          </div>
        </div>
      </Link>
    );
  };

  const isFiltering = Boolean(activeUsernameQuery) || hasAppliedFilters;

  const secondaryInputClass =
    "mt-1.5 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/70";
  const secondaryButtonClass =
    "inline-flex h-9 items-center justify-center rounded-2xl px-4 text-xs font-semibold transition";
  const secondaryLabelClass = "block text-xs text-slate-400";

  return (
    <Shell>
      <div className="space-y-8">
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/90">People</p>
              <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
                {isFiltering ? "Results" : "Everyone on SpotDrop"}
              </h1>
            </div>
          </div>

          {loadError ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">{loadError}</div>
          ) : loading ? (
            renderLoadingCards()
          ) : displayedProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/80 p-6 text-center text-sm text-slate-400">
              No users matched your search.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {displayedProfiles.map((profile) => renderUserCard(profile))}
            </div>
          )}
        </section>

        <div className="space-y-3 border-t border-white/10 pt-6">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Refine list</p>

          <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <h2 className="text-sm font-medium text-slate-300">Search by username</h2>
            <form
              onSubmit={handleUsernameSearch}
              autoComplete="off"
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <label htmlFor="spotdrop-user-search" className={`flex-1 ${secondaryLabelClass}`}>
                Username
                <input
                  id="spotdrop-user-search"
                  name="spotdrop-user-search"
                  type="text"
                  value={usernameInput}
                  onChange={(event) => setUsernameInput(event.target.value)}
                  placeholder="Username"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={secondaryInputClass}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className={`${secondaryButtonClass} bg-cyan-400/90 text-slate-950 hover:bg-cyan-300`}
                >
                  Search
                </button>
                {activeUsernameQuery ? (
                  <button
                    type="button"
                    onClick={clearUsernameSearch}
                    className={`${secondaryButtonClass} border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10`}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <h2 className="text-sm font-medium text-slate-300">Find people by filters</h2>
            <form onSubmit={handleFilterSearch} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={secondaryLabelClass}>
                  Country
                  <select
                    value={filterCountryInput}
                    onChange={(event) => {
                      setFilterCountryInput(event.target.value);
                      setFilterCityInput("");
                    }}
                    disabled={loading}
                    className={`${secondaryInputClass} disabled:opacity-60`}
                  >
                    <option value="">All countries</option>
                    {countries.map((country) => (
                      <option key={country.id} value={country.slug}>
                        {getCountryFlag(country.slug, country.emoji)} {country.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={secondaryLabelClass}>
                  City
                  <select
                    value={filterCityInput}
                    onChange={(event) => setFilterCityInput(event.target.value)}
                    disabled={!filterCountryInput || loading}
                    className={`${secondaryInputClass} disabled:opacity-60`}
                  >
                    <option value="">All cities</option>
                    {availableCities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className={secondaryLabelClass}>
                  Age min
                  <input
                    type="number"
                    min={18}
                    max={99}
                    value={minAgeInput}
                    onChange={(event) => setMinAgeInput(event.target.value)}
                    className={secondaryInputClass}
                  />
                </label>

                <label className={secondaryLabelClass}>
                  Age max
                  <input
                    type="number"
                    min={18}
                    max={99}
                    value={maxAgeInput}
                    onChange={(event) => setMaxAgeInput(event.target.value)}
                    className={secondaryInputClass}
                  />
                </label>
              </div>

              <label className="flex items-center gap-2.5 rounded-2xl border border-white/5 bg-slate-950/50 px-3 py-2.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={onlineOnlyInput}
                  onChange={(event) => setOnlineOnlyInput(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-slate-900 text-cyan-400"
                />
                Online now
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className={`${secondaryButtonClass} bg-cyan-400/90 text-slate-950 hover:bg-cyan-300`}
                >
                  Apply filters
                </button>
                {hasAppliedFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`${secondaryButtonClass} border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10`}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      </div>
    </Shell>
  );
}
