"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import PeopleSearchResults from "@/components/peopleSearch/PeopleSearchResults";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { filterPeopleByFilters } from "@/lib/peopleSearch";
import { loadFiltersSearchState } from "@/lib/peopleSearchSession";
import { usePeopleSearchCatalog } from "@/lib/usePeopleSearchCatalog";
import { isOnlineNow } from "@/lib/userPresence";
import { usePresenceOnlineIds } from "@/lib/usePresenceOnlineIds";

export default function PeopleFiltersResultsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { catalog, loading, error } = usePeopleSearchCatalog();
  const { presenceOnlineIds } = usePresenceOnlineIds();
  const [ready, setReady] = useState(false);
  const [appliedMin, setAppliedMin] = useState<number | null>(null);
  const [appliedMax, setAppliedMax] = useState<number | null>(null);
  const [appliedCountrySlug, setAppliedCountrySlug] = useState("");
  const [appliedCityId, setAppliedCityId] = useState("");
  const [appliedCitySlug, setAppliedCitySlug] = useState("");
  const [appliedOnlineOnly, setAppliedOnlineOnly] = useState(false);

  useEffect(() => {
    const saved = loadFiltersSearchState();

    if (!saved.hasSearched || saved.appliedMin == null || saved.appliedMax == null) {
      router.replace("/search/people/filters");
      return;
    }

    setAppliedMin(saved.appliedMin);
    setAppliedMax(saved.appliedMax);
    setAppliedCountrySlug(saved.appliedCountrySlug);
    setAppliedCityId(saved.appliedCityId);
    setAppliedCitySlug(saved.appliedCitySlug);
    setAppliedOnlineOnly(saved.appliedOnlineOnly);
    setReady(true);
  }, [router]);

  const results = useMemo(() => {
    if (!ready || appliedMin == null || appliedMax == null) {
      return [];
    }

    return filterPeopleByFilters(catalog.profiles, {
      minAge: appliedMin,
      maxAge: appliedMax,
      countrySlug: appliedCountrySlug,
      cityId: appliedCityId,
      citySlug: appliedCitySlug,
      onlineOnly: appliedOnlineOnly,
      isOnline: (profile) =>
        isOnlineNow({
          screen: "search",
          userId: profile.id,
          username: profile.username,
          isOnlineFlag: profile.is_online,
          lastSeenAt: profile.last_seen_at,
          presenceOnline: presenceOnlineIds.has(profile.id),
        }),
    });
  }, [
    catalog.profiles,
    ready,
    appliedMin,
    appliedMax,
    appliedCountrySlug,
    appliedCityId,
    appliedCitySlug,
    appliedOnlineOnly,
    presenceOnlineIds,
  ]);

  const localizedError = localizeUserMessage(t, error);

  if (!ready) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-slate-400">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {localizedError ? (
        <div className="mx-4 mt-3 rounded-[14px] border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-200 sm:mx-0">
          {localizedError}
        </div>
      ) : null}

      <PeopleSearchResults
        mode="filters"
        profiles={results}
        countries={catalog.countries}
        cities={catalog.cities}
        searching={loading}
        showEmpty={!loading}
        emptyTitle={t("search.filters.emptyTitle")}
        emptyBody={t("search.filters.emptyBody")}
      />
    </div>
  );
}
