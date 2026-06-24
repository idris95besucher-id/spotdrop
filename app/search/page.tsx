"use client";

import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import Shell from "@/components/Shell";
import SearchExploreGrid from "@/components/SearchExploreGrid";
import { useI18n } from "@/components/I18nProvider";
import { MOBILE_TAB_TOP_BAR_CLASS, MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

export default function SearchPage() {
  const { t } = useI18n();

  return (
    <Shell
      showHeader={false}
      topBar={
        <div className={MOBILE_TAB_TOP_BAR_CLASS}>
          <Link
            href="/search/people"
            className="flex w-full min-w-0 max-w-full select-none touch-manipulation items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-cyan-400/25 hover:bg-white/[0.06]"
          >
            <SearchIcon className="h-5 w-5 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden />
            <span className="truncate text-sm text-slate-500">{t("search.peopleBarPlaceholder")}</span>
          </Link>
        </div>
      }
    >
      <div className={`pt-3 select-none touch-manipulation ${MOBILE_WIDTH_SAFE_CLASS}`}>
        <SearchExploreGrid />
      </div>
    </Shell>
  );
}
