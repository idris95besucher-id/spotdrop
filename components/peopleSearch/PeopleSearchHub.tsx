"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import PeopleSearchUserCard from "@/components/peopleSearch/PeopleSearchUserCard";
import { getSafeAuthSession } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
import { localizeCityName, localizeCountryName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  loadPeopleBrowsePage,
  PEOPLE_BROWSE_PAGE_SIZE,
  type PeopleBrowseFilters,
  type PeopleSearchProfile,
} from "@/lib/peopleSearch";
import {
  loadFiltersSearchState,
  saveFiltersSearchState,
} from "@/lib/peopleSearchSession";
import { loadUserSettingsPreferences } from "@/lib/settingsPreferences";
import { isOnlineNow } from "@/lib/userPresence";
import { usePresenceOnlineIds } from "@/lib/usePresenceOnlineIds";

function mergeUniqueProfiles(current: PeopleSearchProfile[], incoming: PeopleSearchProfile[]) {
  const seen = new Set(current.map((profile) => profile.id));
  const next = [...current];

  for (const profile of incoming) {
    if (seen.has(profile.id)) {
      continue;
    }

    seen.add(profile.id);
    next.push(profile);
  }

  return next;
}

export default function PeopleSearchHub() {
  const { t, locale } = useI18n();
  const { presenceOnlineIds } = usePresenceOnlineIds();

  const [usernameInput, setUsernameInput] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [profiles, setProfiles] = useState<PeopleSearchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [filtersActive, setFiltersActive] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<{
    minAge: number | null;
    maxAge: number | null;
    countrySlug: string;
    cityId: string;
    citySlug: string;
    onlineOnly: boolean;
  } | null>(null);

  const fetchOffsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    void getSafeAuthSession().then((result) => {
      setSessionUserId(result.session?.user?.id ?? null);
    });
    setBlockedUserIds(loadUserSettingsPreferences().blockedUserIds);
  }, []);

  useEffect(() => {
    const saved = loadFiltersSearchState();
    if (saved.hasSearched && saved.appliedMin != null && saved.appliedMax != null) {
      setFiltersActive(true);
      setAppliedFilters({
        minAge: saved.appliedMin,
        maxAge: saved.appliedMax,
        countrySlug: saved.appliedCountrySlug,
        cityId: saved.appliedCityId,
        citySlug: saved.appliedCitySlug,
        onlineOnly: saved.appliedOnlineOnly,
      });
    } else {
      setFiltersActive(false);
      setAppliedFilters(null);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedUsername(usernameInput.trim().toLowerCase());
    }, 250);

    return () => window.clearTimeout(handle);
  }, [usernameInput]);

  const excludeUserIds = useMemo(() => {
    const ids = [...blockedUserIds];
    if (sessionUserId) {
      ids.push(sessionUserId);
    }
    return ids;
  }, [blockedUserIds, sessionUserId]);

  const browseFilters = useMemo((): PeopleBrowseFilters => {
    const base: PeopleBrowseFilters = {
      usernameQuery: debouncedUsername,
      excludeUserIds,
    };

    if (!filtersActive || !appliedFilters) {
      return base;
    }

    return {
      ...base,
      countrySlug: appliedFilters.countrySlug,
      cityId: appliedFilters.cityId,
      citySlug: appliedFilters.citySlug,
      minAge: appliedFilters.minAge,
      maxAge: appliedFilters.maxAge,
    };
  }, [appliedFilters, debouncedUsername, excludeUserIds, filtersActive]);

  const onlineOnly = Boolean(filtersActive && appliedFilters?.onlineOnly);

  const isProfileOnline = useCallback(
    (profile: PeopleSearchProfile) =>
      isOnlineNow({
        screen: "search",
        userId: profile.id,
        username: profile.username,
        isOnlineFlag: profile.is_online,
        lastSeenAt: profile.last_seen_at,
        presenceOnline: presenceOnlineIds.has(profile.id),
      }),
    [presenceOnlineIds]
  );

  const visibleProfiles = useMemo(() => {
    if (!onlineOnly) {
      return profiles;
    }

    return profiles.filter((profile) => isProfileOnline(profile));
  }, [isProfileOnline, onlineOnly, profiles]);

  const locationLabelFor = useCallback(
    (profile: PeopleSearchProfile) => {
      const countrySlug = profile.country_slug;
      const citySlug = profile.city_slug;
      const countryName = countrySlug
        ? localizeCountryName(locale, { slug: countrySlug, name: countrySlug })
        : null;
      const cityName = citySlug
        ? localizeCityName(locale, {
            slug: citySlug,
            name: citySlug,
            countrySlug: countrySlug ?? null,
          })
        : null;

      if (countrySlug && countryName) {
        const flag = getCountryFlag(countrySlug, null);
        if (cityName) {
          return `${flag} ${cityName}, ${countryName}`;
        }
        return `${flag} ${countryName}`;
      }

      return cityName;
    },
    [locale]
  );

  const loadPage = useCallback(
    async (mode: "reset" | "more") => {
      if (mode === "more") {
        if (loadingMoreRef.current || !hasMore) {
          return;
        }
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        requestIdRef.current += 1;
        fetchOffsetRef.current = 0;
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setLoading(true);
        setError(null);
        setHasMore(true);
      }

      const requestId = requestIdRef.current;
      const offset = mode === "more" ? fetchOffsetRef.current : 0;

      // When Online now is on, keep fetching until we have a usable page of online users
      // or the backend runs out of rows (cap attempts to avoid long loops).
      let nextOffset = offset;
      let collected: PeopleSearchProfile[] = [];
      let more = true;
      let lastError: string | null = null;
      let attempts = 0;
      const maxAttempts = onlineOnly ? 5 : 1;

      while (attempts < maxAttempts && more) {
        attempts += 1;
        const result = await loadPeopleBrowsePage(nextOffset, PEOPLE_BROWSE_PAGE_SIZE, browseFilters);

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (result.error) {
          lastError = result.error;
          more = false;
          break;
        }

        nextOffset += result.fetchedCount;
        more = result.hasMore;
        collected = mergeUniqueProfiles(collected, result.profiles);

        if (!onlineOnly) {
          break;
        }

        const onlineCount = collected.filter((profile) => isProfileOnline(profile)).length;
        if (onlineCount >= PEOPLE_BROWSE_PAGE_SIZE || !more) {
          break;
        }
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      fetchOffsetRef.current = nextOffset;
      setHasMore(more);
      setError(lastError);

      if (mode === "reset") {
        setProfiles(collected);
        setLoading(false);
      } else {
        setProfiles((current) => mergeUniqueProfiles(current, collected));
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [browseFilters, hasMore, isProfileOnline, onlineOnly]
  );

  useEffect(() => {
    void loadPage("reset");
    // Intentionally keyed on browse inputs only — not loadPage identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseFilters, onlineOnly]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadPage("more");
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadPage]);

  const clearFilters = () => {
    const saved = loadFiltersSearchState();
    saveFiltersSearchState({
      ...saved,
      appliedMin: null,
      appliedMax: null,
      appliedCountrySlug: "",
      appliedCityId: "",
      appliedCitySlug: "",
      appliedOnlineOnly: false,
      hasSearched: false,
    });
    setFiltersActive(false);
    setAppliedFilters(null);
  };

  const localizedError = localizeUserMessage(t, error);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-4 pt-3 sm:px-0">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            placeholder={t("search.mode.username.title")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-2xl border border-white/10 bg-[#0d1322] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/45"
          />
        </label>

        <Link
          href="/search/people/filters"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-[#12141c] text-[14px] font-semibold text-white transition active:scale-[0.99] active:bg-[#161822]"
        >
          <SlidersHorizontal className="h-4 w-4 text-cyan-300" strokeWidth={1.75} aria-hidden />
          {t("search.mode.filters.title")}
        </Link>

        {filtersActive ? (
          <div className="flex items-center justify-between gap-2 rounded-[14px] border border-primary/25 bg-primary/10 px-3 py-2">
            <p className="min-w-0 text-[12px] font-medium text-cyan-100">{t("search.filterResults")}</p>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-cyan-200 transition hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t("search.resetFilters")}
            </button>
          </div>
        ) : null}
      </div>

      {localizedError ? (
        <div className="mx-4 mt-3 rounded-[14px] border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-200 sm:mx-0">
          {localizedError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(54px+var(--sd-safe-bottom,0px)+18px)] pt-4 sm:px-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("common.loading")}
          </div>
        ) : visibleProfiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/80 px-6 py-10 text-center">
            <p className="text-base font-semibold text-white">
              {filtersActive || debouncedUsername
                ? t("search.filters.emptyTitle")
                : t("search.noUsersSearch")}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {filtersActive || debouncedUsername
                ? t("search.filters.emptyBody")
                : t("search.hub.subtitle")}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {visibleProfiles.map((profile) => (
              <PeopleSearchUserCard
                key={profile.id}
                profile={profile}
                locationLabel={locationLabelFor(profile)}
                isOnline={isProfileOnline(profile)}
              />
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="h-8 w-full" aria-hidden />

        {loadingMore ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("common.loading")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
