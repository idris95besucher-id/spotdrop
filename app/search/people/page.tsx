"use client";

import Shell from "@/components/Shell";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import PeopleSearchScreen from "@/components/PeopleSearchScreen";
import { useI18n } from "@/components/I18nProvider";

export default function SearchPeoplePage() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false}>
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileSecondaryHeader title={t("search.people")} backHref="/search" />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-0">
          <PeopleSearchScreen />
        </div>
      </div>
    </Shell>
  );
}
