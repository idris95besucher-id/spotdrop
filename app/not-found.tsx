"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#050816] px-6 text-center text-white">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/visit"
          className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950"
        >
          {t("nav.visit")}
        </Link>
        <Link
          href="/profile"
          className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white"
        >
          {t("nav.myProfile")}
        </Link>
      </div>
    </div>
  );
}
