"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type GlobalSearchButtonProps = {
  className?: string;
};

export default function GlobalSearchButton({ className = "" }: GlobalSearchButtonProps) {
  const { t } = useI18n();

  return (
    <Link
      href="/search"
      className={`inline-flex h-9 w-9 select-none touch-manipulation items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80 ${className}`}
      aria-label={t("nav.search")}
    >
      <Search className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
    </Link>
  );
}
