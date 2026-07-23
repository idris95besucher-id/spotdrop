"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useI18n } from "@/components/I18nProvider";
import PeopleSearchUserCard from "@/components/peopleSearch/PeopleSearchUserCard";
import { getCountryFlag } from "@/lib/countryFlags";
import { localizeCityName, localizeCountryName } from "@/lib/i18n/localizeGeo";
import type { PeopleSearchCity, PeopleSearchCountry, PeopleSearchProfile } from "@/lib/peopleSearch";
import {
  loadPeopleSearchScroll,
  savePeopleSearchScroll,
  type PeopleSearchMode,
} from "@/lib/peopleSearchSession";
import { isOnlineNow } from "@/lib/userPresence";
import { usePresenceOnlineIds } from "@/lib/usePresenceOnlineIds";

type PeopleSearchResultsProps = {
  mode: PeopleSearchMode;
  profiles: PeopleSearchProfile[];
  countries: PeopleSearchCountry[];
  cities: PeopleSearchCity[];
  searching?: boolean;
  emptyTitle: string;
  emptyBody: string;
  /** Only show empty state after a completed search. */
  showEmpty: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
  header?: ReactNode;
};

export default function PeopleSearchResults({
  mode,
  profiles,
  countries,
  cities,
  searching = false,
  emptyTitle,
  emptyBody,
  showEmpty,
  scrollRef: externalScrollRef,
  header,
}: PeopleSearchResultsProps) {
  const { locale } = useI18n();
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;
  const { presenceOnlineIds } = usePresenceOnlineIds();

  const cityById = useMemo(
    () => new Map(cities.map((city) => [String(city.id), city])),
    [cities]
  );
  const countryBySlug = useMemo(
    () => new Map(countries.map((country) => [country.slug.trim().toLowerCase(), country])),
    [countries]
  );

  useEffect(() => {
    const node = scrollRef.current;

    if (!node) {
      return;
    }

    const saved = loadPeopleSearchScroll(mode);

    if (saved > 0) {
      requestAnimationFrame(() => {
        node.scrollTop = saved;
      });
    }

    const persist = () => {
      savePeopleSearchScroll(mode, node.scrollTop);
    };

    node.addEventListener("scroll", persist, { passive: true });

    return () => {
      persist();
      node.removeEventListener("scroll", persist);
    };
  }, [mode, scrollRef]);

  const persistNow = useCallback(() => {
    if (scrollRef.current) {
      savePeopleSearchScroll(mode, scrollRef.current.scrollTop);
    }
  }, [mode, scrollRef]);

  const locationFor = (profile: PeopleSearchProfile) => {
    const country = profile.country_slug
      ? countryBySlug.get(profile.country_slug.trim().toLowerCase()) ?? null
      : null;
    const city = profile.city_id ? cityById.get(String(profile.city_id)) ?? null : null;
    const localizedCityName = city
      ? localizeCityName(locale, {
          slug: city.slug,
          name: city.name,
          countrySlug: country?.slug ?? null,
        })
      : null;
    const localizedCountryName = country
      ? localizeCountryName(locale, { slug: country.slug, name: country.name })
      : null;

    if (country) {
      return `${getCountryFlag(country.slug, country.emoji)} ${localizedCityName ? `${localizedCityName}, ` : ""}${localizedCountryName}`;
    }

    return localizedCityName;
  };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-0">
      {header}
      {searching ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`people-search-loading-${index}`}
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
      ) : showEmpty && profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/80 px-6 py-10 text-center">
          <p className="text-base font-semibold text-white">{emptyTitle}</p>
          <p className="mt-2 text-sm text-slate-400">{emptyBody}</p>
        </div>
      ) : profiles.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {profiles.map((profile) => (
            <PeopleSearchUserCard
              key={profile.id}
              profile={profile}
              locationLabel={locationFor(profile)}
              isOnline={isOnlineNow({
                screen: "search",
                userId: profile.id,
                username: profile.username,
                isOnlineFlag: profile.is_online,
                lastSeenAt: profile.last_seen_at,
                presenceOnline: presenceOnlineIds.has(profile.id),
              })}
              onNavigate={persistNow}
            />
          ))}
        </div>
      ) : null}
      {/* accessibility: keep results region announced */}
    </div>
  );
}
