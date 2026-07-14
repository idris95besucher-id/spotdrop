"use client";

import Link from "next/link";
import { AtSign, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

const MODE_CARDS = [
  {
    href: "/search/people/username",
    icon: AtSign,
    titleKey: "search.mode.username.title" as const,
    descKey: "search.mode.username.desc" as const,
  },
  {
    href: "/search/people/filters",
    icon: SlidersHorizontal,
    titleKey: "search.mode.filters.title" as const,
    descKey: "search.mode.filters.desc" as const,
  },
];

export default function PeopleSearchHub() {
  const { t } = useI18n();

  return (
    <div className="select-none touch-manipulation">
      <header className="pb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">{t("search.hub.title")}</h1>
        <p className="mt-1 text-[13px] leading-snug text-slate-500">{t("search.hub.subtitle")}</p>
      </header>

      <div className="space-y-2.5">
        {MODE_CARDS.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.href}
              href={card.href}
              className="flex items-center gap-3 rounded-[20px] border border-white/[0.06] bg-[#12141c] px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition duration-150 active:scale-[0.985] active:bg-[#161822]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.05] text-cyan-300/90">
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold leading-tight text-white">{t(card.titleKey)}</h2>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{t(card.descKey)}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" strokeWidth={1.75} aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
