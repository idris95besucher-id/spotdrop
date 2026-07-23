"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";

/** Legacy route — filter results now render on `/search/people`. */
export default function SearchPeopleFiltersResultsPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    router.replace("/search/people");
  }, [router]);

  return (
    <Shell showHeader={false} fixedLayout>
      <div className="flex flex-1 items-center justify-center text-sm text-muted">{t("common.loading")}</div>
    </Shell>
  );
}