"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import type { GuidePlace } from "@/lib/guidePlaces";

type GuidePlaceCardProps = {
  place: GuidePlace;
  postId?: string;
};

function getPlaceLocation(place: GuidePlace) {
  return [place.location_name, place.city, place.canton].filter(Boolean).join(" · ");
}

export default function GuidePlaceCard({ place, postId }: GuidePlaceCardProps) {
  const { t } = useI18n();
  const mediaType = place.media_type === "video" ? "video" : "image";
  const readMoreHref = postId ? `/posts/${postId}` : place.official_url;
  const location = getPlaceLocation(place);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-slate-950 shadow-2xl shadow-black/30">
      {place.media_url ? (
        <div className="relative aspect-[4/5] overflow-hidden bg-slate-900 sm:aspect-[16/11]">
          {mediaType === "video" ? (
            <video src={place.media_url} playsInline muted className="h-full w-full object-cover" />
          ) : (
            <img src={place.media_url} alt={place.title} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">{t("guidePlace.badge")}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{place.title}</h2>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-cyan-500/20 via-slate-900 to-indigo-500/20 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">{t("guidePlace.badge")}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{place.title}</h2>
        </div>
      )}

      <div className="space-y-5 p-5">
        {place.description ? <p className="text-sm leading-7 text-slate-200">{place.description}</p> : null}

        <div className="grid gap-3 text-left sm:grid-cols-2">
          {location ? (
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("guidePlace.location")}</p>
              <p className="mt-2 text-sm font-semibold text-white">{location}</p>
            </div>
          ) : null}
          {place.opening_hours ? (
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("guidePlace.opening")}</p>
              <p className="mt-2 text-sm font-semibold text-white">{place.opening_hours}</p>
            </div>
          ) : null}
          {place.price_info ? (
            <div className="rounded-2xl bg-white/[0.04] p-4 sm:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{t("guidePlace.price")}</p>
              <p className="mt-2 text-sm font-semibold text-white">{place.price_info}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {readMoreHref ? (
            <Link
              href={readMoreHref}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {t("guidePlace.readMore")}
            </Link>
          ) : null}
          {place.official_url ? (
            <a
              href={place.official_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {t("guidePlace.officialWebsite")}
            </a>
          ) : null}
        </div>

        {place.source_url ? (
          <p className="text-[11px] leading-relaxed text-slate-600">
            {t("guidePlace.mediaSource")} {place.source_url}
          </p>
        ) : null}
      </div>
    </div>
  );
}
