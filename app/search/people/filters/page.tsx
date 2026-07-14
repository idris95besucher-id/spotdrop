"use client";

import Shell from "@/components/Shell";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import PeopleFiltersSearchScreen from "@/components/peopleSearch/PeopleFiltersSearchScreen";
import { useI18n } from "@/components/I18nProvider";

export default function SearchPeopleFiltersPage() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} fixedLayout>
      <div className="flex min-h-0 flex-1 select-none touch-manipulation flex-col">
        <MobileSecondaryHeader title={t("search.mode.filters.pageTitle")} backHref="/search/people" preferFallback />
        <PeopleFiltersSearchScreen />
      </div>
    </Shell>
  );
}
