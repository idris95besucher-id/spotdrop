"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MapPinned, Navigation } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  buildMapMarkDeepLink,
  type CityRoomMapMarkPayload,
} from "@/lib/cityRoomMapMarkMessage";
import {
  mapMarkCategoryAccent,
  mapMarkCategoryIcon,
  mapMarkCategoryLabelKey,
  normalizeMapMarkCategory,
} from "@/lib/mapMarkCategories";
import { formatChatMessageTime } from "@/lib/chatDates";
import { publicProfileUsername } from "@/lib/publicProfile";
import type { CityRoomMessageProfile } from "@/components/CityRoomMessageBubble";

type CityRoomMapMarkCardProps = {
  mark: CityRoomMapMarkPayload;
  profile: CityRoomMessageProfile | null;
  userId: string;
  createdAt: string;
  markMissing?: boolean;
};

function shortPlaceLabel(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  // Drop long administrative district phrasing from geocoder leftovers.
  if (/administrative|district|arrondissement|bezirk|kreis/i.test(trimmed) && trimmed.length > 28) {
    return "";
  }

  return trimmed;
}

export default function CityRoomMapMarkCard({
  mark,
  profile,
  userId,
  createdAt,
  markMissing = false,
}: CityRoomMapMarkCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const category = normalizeMapMarkCategory(mark.category);
  const CategoryIcon = mapMarkCategoryIcon(category);
  const accent = mapMarkCategoryAccent(category);
  // Prefer the Mark's denormalized creator (correct even when someone else forwarded this
  // card into the room) — fall back to the message sender's profile for older messages
  // encoded before creatorUsername/creatorAvatarUrl/creatorUserId existed.
  const creatorUserId = mark.creatorUserId ?? userId;
  const creatorUsername = mark.creatorUsername ?? (profile ? publicProfileUsername(profile.username) : null);
  const creatorAvatarUrl = mark.creatorAvatarUrl ?? profile?.avatar_url ?? null;
  const displayName = creatorUsername ?? t("common.user");
  const profileHref = `/user?id=${encodeURIComponent(creatorUserId)}`;
  const mapHref = buildMapMarkDeepLink(mark.mapMarkId);

  const placeLine = useMemo(() => {
    const municipality = shortPlaceLabel(mark.municipality) || shortPlaceLabel(mark.placeName);
    const region = shortPlaceLabel(mark.regionName) || shortPlaceLabel(mark.cantonName);
    const country = shortPlaceLabel(mark.countryName);

    if (municipality && region && country) {
      return t("map.markRoomCard.placeRegionCountry", {
        place: municipality,
        region,
        country,
      });
    }

    if (municipality && region) {
      return t("map.markRoomCard.placeRegion", { place: municipality, region });
    }

    return municipality || region || country || t("map.selectedLocation");
  }, [mark.cantonName, mark.countryName, mark.municipality, mark.placeName, mark.regionName, t]);

  const text = mark.text.trim();
  const needsClamp = text.length > 140;
  const shownText = !needsClamp || expanded ? text : `${text.slice(0, 137).trimEnd()}…`;

  if (markMissing) {
    return (
      <div className="sd-room-mark-card w-full max-w-[16.75rem] overflow-hidden rounded-[1.15rem] border border-white/[0.07] bg-[#141b2a]/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
        <p className="text-sm text-slate-400">{t("map.markUnavailable")}</p>
      </div>
    );
  }

  return (
    <article className="sd-room-mark-card w-full max-w-[16.75rem] overflow-hidden rounded-[1.15rem] border border-white/[0.07] bg-[#141b2a]/95 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
      <div className="flex items-center gap-2 px-3 pb-0 pt-2.5">
        <Link
          href={profileHref}
          className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800/90 text-[10px] font-semibold text-white ring-1 ring-white/10"
        >
          {creatorAvatarUrl ? (
            <img src={creatorAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <Link
              href={profileHref}
              className="truncate text-[12.5px] font-semibold text-white/95 hover:underline"
            >
              @{displayName}
            </Link>
            <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
              {formatChatMessageTime(createdAt)}
            </span>
          </div>
          <p className="truncate text-[10.5px] leading-tight text-slate-500">{t("map.markRoomCard.heading")}</p>
        </div>
      </div>

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

        <div className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500">
          <MapPinned className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-hidden />
          <span className="line-clamp-2 min-w-0">{placeLine}</span>
        </div>

        <Link
          href={mapHref}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500/80 to-teal-400/75 px-3 py-2 text-[12px] font-semibold text-slate-950 transition duration-150 hover:from-cyan-400/90 hover:to-teal-300/85 active:scale-[0.98]"
        >
          <Navigation className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          {t("map.markOpenMap")}
        </Link>
      </div>
    </article>
  );
}
