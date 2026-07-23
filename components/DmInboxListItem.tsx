"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import ProfileAvatar from "@/components/ProfileAvatar";
import UserOnlineDot from "@/components/UserOnlineDot";
import { formatChatPreview } from "@/lib/i18n/chatPreview";
import type { InboxChatRow } from "@/lib/chatsInbox";
import { publicProfileUsername } from "@/lib/publicProfile";
import { dmThreadHref } from "@/lib/chatThreadRoutes";
import { warmDmThreadCache } from "@/lib/dmThreadCache";
import { useLongPress } from "@/lib/useLongPress";

type DmInboxListItemProps = {
  chat: InboxChatRow;
  onLongPress: (chat: InboxChatRow) => void;
  onSwipeDelete?: (chat: InboxChatRow) => void;
};

const SWIPE_DELETE_WIDTH = 88;
const SWIPE_OPEN_THRESHOLD = 48;

function formatChatTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
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

export default function DmInboxListItem({ chat, onLongPress, onSwipeDelete }: DmInboxListItemProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { session } = useAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const href = dmThreadHref(chat.partnerId);
  const hasUnread = chat.unreadCount > 0;
  const preview = chat.lastMessage
    ? formatChatPreview(chat.lastMessage, t)
    : t("chats.preview.noMessages");

  const [offsetX, setOffsetX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const axisLockedRef = useRef<"x" | "y" | null>(null);
  const suppressClickRef = useRef(false);

  const { longPressProps, onClickCapture } = useLongPress({
    onLongPress: () => {
      setOffsetX(0);
      onLongPress(chat);
    },
  });

  useEffect(() => {
    if (currentUserId) {
      warmDmThreadCache(currentUserId, chat.partnerId);
    }
  }, [chat.partnerId, currentUserId]);

  const prefetchThread = useCallback(() => {
    router.prefetch(href);
  }, [href, router]);

  const closeSwipe = useCallback(() => setOffsetX(0), []);

  return (
    <li
      className="relative select-none touch-manipulation overflow-hidden"
      {...longPressProps}
    >
      <div className="absolute inset-y-0 right-0 flex w-[88px] items-stretch">
        <button
          type="button"
          className="flex w-full items-center justify-center bg-red-600 px-2 text-center text-xs font-semibold text-white"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOffsetX(0);
            (onSwipeDelete ?? onLongPress)(chat);
          }}
        >
          {t("chats.deleteChat")}
        </button>
      </div>

      <div
        className="relative bg-[#050816] transition-transform duration-150 ease-out"
        style={{ transform: `translate3d(${offsetX}px, 0, 0)` }}
        onTouchStart={(event) => {
          if (event.touches.length !== 1) {
            return;
          }
          startXRef.current = event.touches[0].clientX;
          startYRef.current = event.touches[0].clientY;
          draggingRef.current = true;
          axisLockedRef.current = null;
        }}
        onTouchMove={(event) => {
          if (!draggingRef.current || startXRef.current == null || startYRef.current == null) {
            return;
          }

          const dx = event.touches[0].clientX - startXRef.current;
          const dy = event.touches[0].clientY - startYRef.current;

          if (!axisLockedRef.current) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
              return;
            }
            axisLockedRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          }

          if (axisLockedRef.current !== "x") {
            return;
          }

          event.preventDefault();
          const next = Math.min(0, Math.max(-SWIPE_DELETE_WIDTH, dx));
          setOffsetX(next);
          if (Math.abs(next) > 8) {
            suppressClickRef.current = true;
          }
        }}
        onTouchEnd={() => {
          draggingRef.current = false;
          startXRef.current = null;
          startYRef.current = null;
          setOffsetX((current) => (current <= -SWIPE_OPEN_THRESHOLD ? -SWIPE_DELETE_WIDTH : 0));
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }}
        onTouchCancel={() => {
          draggingRef.current = false;
          startXRef.current = null;
          startYRef.current = null;
          closeSwipe();
        }}
      >
        <Link
          href={href}
          prefetch={false}
          onMouseEnter={prefetchThread}
          onTouchStart={prefetchThread}
          onClickCapture={(event) => {
            if (suppressClickRef.current || offsetX !== 0) {
              event.preventDefault();
              event.stopPropagation();
              closeSwipe();
              return;
            }
            onClickCapture(event);
          }}
          className={`flex items-center gap-3 px-4 py-3.5 transition sm:gap-4 sm:px-5 sm:py-4 ${
            hasUnread ? "bg-primary/[0.06]" : "hover:bg-white/[0.03]"
          }`}
          style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        >
          <div className="relative shrink-0">
            <ProfileAvatar
              src={chat.avatarUrl}
              sizeClassName="h-14 w-14 sm:h-16 sm:w-16"
              iconClassName="h-6 w-6"
              className="bg-white/[0.06]"
            />
            {hasUnread ? (
              <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0B1026] bg-primary" />
            ) : null}
            <UserOnlineDot
              userId={chat.partnerId}
              lastSeenAt={chat.lastSeenAt}
              username={chat.username}
              screen="chats-inbox"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={`truncate text-[15px] sm:text-base ${
                  hasUnread ? "font-bold text-white" : "font-semibold text-white"
                }`}
              >
                {publicProfileUsername(chat.username)}
              </p>
              <time className={`shrink-0 text-xs ${hasUnread ? "font-semibold text-primary" : "text-muted"}`}>
                {formatChatTime(chat.lastAt)}
              </time>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className={`min-w-0 truncate text-sm ${hasUnread ? "font-medium text-slate-200" : "text-muted"}`}>
                {preview}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                {hasUnread && chat.unreadBadge ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-[#050816]">
                    {chat.unreadBadge}
                  </span>
                ) : null}
                {chat.isMuted ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {t("chats.roomMuted")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </Link>
      </div>
    </li>
  );
}
