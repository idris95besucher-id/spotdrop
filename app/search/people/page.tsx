"use client";

import Shell from "@/components/Shell";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import PeopleSearchHub from "@/components/peopleSearch/PeopleSearchHub";
import { useI18n } from "@/components/I18nProvider";

export default function SearchPeoplePage() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} fixedLayout>
      <div className="flex min-h-0 flex-1 select-none touch-manipulation flex-col">
        <MobileSecondaryHeader title={t("search.people")} backHref="/search" preferFallback />
        <PeopleSearchHub />
      </div>
    </Shell>
  );
}
