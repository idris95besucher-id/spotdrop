"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Globe2, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatRoomMessagePreview, formatRoomUnreadLabel } from "@/lib/roomMessagePreview";
import { buildRoomHref, type RoomInboxRow } from "@/lib/roomMemberships";

type RoomInboxListItemProps = {
  room: RoomInboxRow;
  onMute: (room: RoomInboxRow, muted: boolean) => void;
  onHide: (room: RoomInboxRow) => void;
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

export default function RoomInboxListItem({ room, onMute, onHide }: RoomInboxListItemProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasUnread = !room.isMuted && room.unreadCount > 0;
  const preview = formatRoomMessagePreview(room.lastMessageContent, t);
  const unreadLabel = formatRoomUnreadLabel(room.unreadCount, t);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <li className="relative">
      <Link
        href={buildRoomHref(room.countrySlug, room.citySlug)}
        className={`flex items-center gap-3 px-4 py-3.5 transition sm:gap-4 sm:px-5 sm:py-4 ${
          hasUnread ? "bg-primary/[0.06]" : "hover:bg-white/[0.03]"
        }`}
      >
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] sm:h-16 sm:w-16">
            <Globe2 className="h-6 w-6 text-primary" strokeWidth={1.5} aria-hidden />
          </div>
          {hasUnread ? (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0B1026] bg-primary" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-[15px] sm:text-base ${hasUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
              {room.cityName}
            </p>
            <time className={`shrink-0 text-xs ${hasUnread ? "font-semibold text-primary" : "text-muted"}`}>
              {formatRoomTime(room.lastAt)}
            </time>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{room.countryName}</p>
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

      <div ref={menuRef} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 sm:right-4">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label={t("chats.roomOptions")}
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-full mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-[#0B1026] py-1 shadow-xl shadow-black/40">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onMute(room, !room.isMuted);
              }}
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
            >
              {room.isMuted ? t("chats.unmuteRoom") : t("chats.muteRoom")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onHide(room);
              }}
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
            >
              {t("chats.hideRoom")}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
