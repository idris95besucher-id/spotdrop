"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import Shell from "@/components/Shell";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import CountryCitiesPanel from "@/components/rooms/CountryCitiesPanel";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { useI18n } from "@/components/I18nProvider";
import { localizeCountryName } from "@/lib/i18n/localizeGeo";
import type { RoomCountry } from "@/lib/roomExplore";

function InvalidCountryPanel({ t }: { t: ReturnType<typeof useI18n>["t"] }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-slate-300">
      <p className="text-lg font-semibold text-white">{t("rooms.invalidCountry")}</p>
      <p className="mt-3 text-slate-400">{t("rooms.selectValidCountry")}</p>
      <Link href="/visit" className="mt-6 inline-flex rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
        {t("rooms.backToCountries")}
      </Link>
    </div>
  );
}

export default function CountryRoomsPage() {
  const { t, locale } = useI18n();
  const params = useParams<{ country: string }>();
  const countrySlug = String(params.country ?? "").toLowerCase();
  const [resolvedCountry, setResolvedCountry] = useState<RoomCountry | null>(null);

  if (!countrySlug) {
    return (
      <Shell showHeader={false} flushTop>
        <InvalidCountryPanel t={t} />
      </Shell>
    );
  }

  const headerTitle = resolvedCountry
    ? localizeCountryName(locale, { slug: resolvedCountry.slug, name: resolvedCountry.name })
    : t("rooms.cities");

  return (
    <Shell showHeader={false} flushTop>
      <div className={`flex min-h-0 flex-1 flex-col ${MOBILE_WIDTH_SAFE_CLASS}`}>
        <MobileSecondaryHeader title={headerTitle} backHref="/visit" preferFallback />
        <div className="space-y-8 px-4 py-6 sm:px-0">
          <CountryCitiesPanel
            countrySlug={countrySlug}
            onCountryResolved={setResolvedCountry}
          />
        </div>
      </div>
    </Shell>
  );
}
