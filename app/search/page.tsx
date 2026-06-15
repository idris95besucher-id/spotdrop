"use client";

import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import Shell from "@/components/Shell";
import SearchExploreGrid from "@/components/SearchExploreGrid";
import { useI18n } from "@/components/I18nProvider";

export default function SearchPage() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-lg pb-2 pt-1 sm:max-w-xl md:max-w-2xl">
        <div className="sticky top-0 z-20 -mx-4 border-b border-white/[0.08] bg-[#050816]/95 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md sm:mx-0 sm:rounded-none sm:px-0">
          <Link
            href="/search/people"
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-cyan-400/25 hover:bg-white/[0.06]"
          >
            <SearchIcon className="h-5 w-5 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden />
            <span className="text-sm text-slate-500">{t("search.peopleBarPlaceholder")}</span>
          </Link>
        </div>

        <div className="-mx-4 mt-3 sm:mx-0">
          <SearchExploreGrid />
        </div>
      </div>
    </Shell>
  );
}
