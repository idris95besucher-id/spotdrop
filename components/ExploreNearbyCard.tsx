"use client";

import Link from "next/link";
import { ChevronRight, Globe2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export default function ExploreNearbyCard() {
  const { t } = useI18n();

  return (
    <Link
      href="/visit"
      className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-card/80 px-4 py-4 transition hover:border-cyan-400/25 hover:bg-card"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-400/20">
        <Globe2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{t("feed.exploreNearby")}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t("feed.exploreNearbyBody")}</span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:text-cyan-300"
        strokeWidth={1.75}
        aria-hidden
      />
    </Link>
  );
}
