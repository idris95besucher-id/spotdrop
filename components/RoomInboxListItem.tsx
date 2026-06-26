"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import { formatRoomMessagePreview, formatRoomUnreadLabel } from "@/lib/roomMessagePreview";
import {
  logRoomInboxFlagDebug,
  resolveRoomInboxCountryIsoCode,
  roomInboxFlagImageUrl,
} from "@/lib/roomInboxCountryFlag";
import {
  buildRoomHref,
  ROOM_FROM_MESSAGES,
  setRoomReturnToMessages,
  type RoomInboxRow,
} from "@/lib/roomMemberships";
import { useLongPress } from "@/lib/useLongPress";

type RoomInboxListItemProps = {
  room: RoomInboxRow;
  onLongPress: (room: RoomInboxRow) => void;
};

function formatRoomTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) {
    return "";
  }

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function RoomInboxListItem({ room, onLongPress }: RoomInboxListItemProps) {
  const { t, locale } = useI18n();
  const [flagImageFailed, setFlagImageFailed] = useState(false);
  const hasUnread = !room.isMuted && room.unreadCount > 0;
  const preview = formatRoomMessagePreview(room.lastMessageContent, t);
  const unreadLabel = formatRoomUnreadLabel(room.unreadCount, t);

  const { longPressProps, onClickCapture } = useLongPress({
    onLongPress: () => onLongPress(room),
  });

  const roomHref = buildRoomHref(room.countrySlug, room.citySlug, { from: ROOM_FROM_MESSAGES });
  const cityTitle = localizeCityName(locale, {
    slug: room.citySlug,
    name: room.cityName,
    countrySlug: room.countrySlug,
  });

  const flagInput = {
    countrySlug: room.countrySlug,
    countryCode: room.countryCode,
    countryName: room.countryName,
    citySlug: room.citySlug,
    cityName: room.cityName,
    displayTitle: cityTitle,
  };

  const countryIsoCode = resolveRoomInboxCountryIsoCode(flagInput);
  const showFlagImage = Boolean(countryIsoCode && !flagImageFailed);

  useEffect(() => {
    setFlagImageFailed(false);
  }, [countryIsoCode, room.membershipId]);

  useEffect(() => {
    logRoomInboxFlagDebug(flagInput);
  }, [
    cityTitle,
    room.cityName,
    room.citySlug,
    room.countryCode,
    room.countryName,
    room.countrySlug,
    room.membershipId,
  ]);

  const markReturnToMessages = () => {
    setRoomReturnToMessages();
  };

  return (
    <li {...longPressProps} className="select-none touch-manipulation">
      <Link
        href={roomHref}
        onPointerDown={markReturnToMessages}
        onClick={markReturnToMessages}
        onClickCapture={onClickCapture}
        className={`flex items-center gap-3 px-4 py-3.5 transition sm:gap-4 sm:px-5 sm:py-4 ${
          hasUnread ? "bg-primary/[0.06]" : "hover:bg-white/[0.03]"
        }`}
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      >
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] sm:h-16 sm:w-16">
            {showFlagImage ? (
              <img
                src={roomInboxFlagImageUrl(countryIsoCode!)}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
                onError={() => setFlagImageFailed(true)}
              />
            ) : (
              <Globe2 className="h-6 w-6 text-primary" strokeWidth={1.5} aria-hidden />
            )}
          </div>
          {hasUnread ? (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0B1026] bg-primary" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-[15px] sm:text-base ${hasUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
              {cityTitle}
            </p>
            <time className={`shrink-0 text-xs ${hasUnread ? "font-semibold text-primary" : "text-muted"}`}>
              {formatRoomTime(room.lastAt)}
            </time>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {localizeCountryName(locale, { slug: room.countrySlug, name: room.countryName })}
          </p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className={`truncate text-sm ${hasUnread ? "font-medium text-slate-200" : "text-muted"}`}>
              {unreadLabel ?? preview}
            </p>
            {hasUnread && room.unreadBadge ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-[#050816]">
                {room.unreadBadge}
              </span>
            ) : room.isMuted ? (
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {t("chats.roomMuted")}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
