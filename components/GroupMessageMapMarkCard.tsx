"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MapPinned, Navigation } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buildMapMarkDeepLink, parseCityRoomMapMarkMessage } from "@/lib/cityRoomMapMarkMessage";
import {
  mapMarkCategoryAccent,
  mapMarkCategoryIcon,
  mapMarkCategoryLabelKey,
  normalizeMapMarkCategory,
} from "@/lib/mapMarkCategories";

type GroupMessageMapMarkCardProps = {
  body: string;
  isOwnMessage: boolean;
};

/** Group-chat counterpart of DirectMessageMapMarkCard — same encoding, no DM-only read receipts. */
export default function GroupMessageMapMarkCard({ body, isOwnMessage }: GroupMessageMapMarkCardProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const mark = parseCityRoomMapMarkMessage(body);

  const placeLine = useMemo(() => {
    if (!mark) {
      return "";
    }

    return mark.placeName?.trim() || mark.municipality?.trim() || mark.regionName?.trim() || t("map.selectedLocation");
  }, [mark, t]);

  if (!mark) {
    return (
      <div
        className={`max-w-[85%] rounded-[22px] px-4 py-2.5 shadow-md shadow-black/20 ${
          isOwnMessage
            ? "rounded-br-md bg-primary/20 text-cyan-50"
            : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
        }`}
      >
        <p className="text-sm text-slate-300">{t("map.markUnavailable")}</p>
      </div>
    );
  }

  const category = normalizeMapMarkCategory(mark.category);
  const CategoryIcon = mapMarkCategoryIcon(category);
  const accent = mapMarkCategoryAccent(category);
  const mapHref = buildMapMarkDeepLink(mark.mapMarkId);
  const profileHref = mark.creatorUserId ? `/user?id=${encodeURIComponent(mark.creatorUserId)}` : null;

  const text = mark.text.trim();
  const needsClamp = text.length > 140;
  const shownText = !needsClamp || expanded ? text : `${text.slice(0, 137).trimEnd()}…`;

  const openOnMap = () => {
    router.push(mapHref);
  };

  return (
    <div className={`max-w-[85%] ${isOwnMessage ? "rounded-br-md" : "rounded-bl-md"}`}>
      <article className="w-full overflow-hidden rounded-2xl bg-[#122033]/95 ring-1 ring-white/8">
        {mark.creatorUsername ? (
          <Link
            href={profileHref ?? "#"}
            className="flex items-center gap-2 px-3 pb-0 pt-2.5 hover:opacity-90"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800/90 text-[10px] font-semibold text-white ring-1 ring-white/10">
              {mark.creatorAvatarUrl ? (
                <img src={mark.creatorAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                mark.creatorUsername.charAt(0).toUpperCase()
              )}
            </span>
            <span className="truncate text-[11.5px] font-medium text-slate-400">
              {t("map.shareMark.createdBy", { username: mark.creatorUsername })}
            </span>
          </Link>
        ) : null}

        {mark.photoUrl ? (
          <div className="mt-2 px-2.5">
            <img
              src={mark.photoUrl}
              alt=""
              className="h-32 w-full rounded-xl object-cover ring-1 ring-white/[0.06]"
            />
          </div>
        ) : null}

        <div className="space-y-2 px-3 pb-2.5 pt-2">
          <div
            className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${accent.chipClass}`}
          >
            <CategoryIcon className={`h-3 w-3 shrink-0 ${accent.iconClass}`} aria-hidden />
            <span className="truncate">{t(mapMarkCategoryLabelKey(category))}</span>
          </div>

          <p className="whitespace-pre-wrap text-[13px] leading-snug text-slate-100/95">{shownText}</p>
          {needsClamp ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-[11px] font-medium text-cyan-300/80 hover:text-cyan-200"
            >
              {expanded ? t("common.showLess") : t("common.readMore")}
            </button>
          ) : null}

          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500">
            <MapPinned className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-hidden />
            <span>
              {placeLine}
              <span className="mt-0.5 block text-slate-500">
                {mark.latitude.toFixed(5)}, {mark.longitude.toFixed(5)}
              </span>
            </span>
          </p>

          <button
            type="button"
            onClick={openOnMap}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500/80 to-teal-400/75 px-3 py-2 text-[12px] font-semibold text-slate-950 transition duration-150 hover:from-cyan-400/90 hover:to-teal-300/85 active:scale-[0.98]"
          >
            <Navigation className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            {t("map.markOpenMap")}
          </button>
        </div>
      </article>
    </div>
  );
}
