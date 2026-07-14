"use client";

import Shell from "@/components/Shell";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import PeopleUsernameSearchScreen from "@/components/peopleSearch/PeopleUsernameSearchScreen";
import { useI18n } from "@/components/I18nProvider";

export default function SearchPeopleUsernamePage() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} fixedLayout>
      <div className="flex min-h-0 flex-1 select-none touch-manipulation flex-col">
        <MobileSecondaryHeader title={t("search.mode.username.title")} backHref="/search/people" preferFallback />
        <PeopleUsernameSearchScreen />
      </div>
    </Shell>
  );
}
