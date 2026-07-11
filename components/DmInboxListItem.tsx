"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { UserRound } from "lucide-react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { formatChatPreview } from "@/lib/i18n/chatPreview";
import type { InboxChatRow } from "@/lib/chatsInbox";
import { publicProfileUsername } from "@/lib/publicProfile";
import { dmThreadHref } from "@/lib/chatThreadRoutes";
import { warmDmThreadCache } from "@/lib/dmThreadCache";
import { useLongPress } from "@/lib/useLongPress";
import UserOnlineDot from "@/components/UserOnlineDot";

type DmInboxListItemProps = {
  chat: InboxChatRow;
  onLongPress: (chat: InboxChatRow) => void;
};

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

export default function DmInboxListItem({ chat, onLongPress }: DmInboxListItemProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { session } = useAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const href = dmThreadHref(chat.partnerId);
  const hasUnread = chat.unreadCount > 0;
  const preview = chat.lastMessage
    ? formatChatPreview(chat.lastMessage, t)
    : t("chats.preview.noMessages");

  const { longPressProps, onClickCapture } = useLongPress({
    onLongPress: () => onLongPress(chat),
  });

  useEffect(() => {
    if (currentUserId) {
      warmDmThreadCache(currentUserId, chat.partnerId);
    }
  }, [chat.partnerId, currentUserId]);

  const prefetchThread = useCallback(() => {
    router.prefetch(href);
  }, [href, router]);

  return (
    <li {...longPressProps} className="select-none touch-manipulation">
      <Link
        href={href}
        prefetch={false}
        onMouseEnter={prefetchThread}
        onTouchStart={prefetchThread}
        onClickCapture={onClickCapture}
        className={`flex items-center gap-3 px-4 py-3.5 transition sm:gap-4 sm:px-5 sm:py-4 ${
          hasUnread ? "bg-primary/[0.06]" : "hover:bg-white/[0.03]"
        }`}
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      >
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] sm:h-16 sm:w-16">
            {chat.avatarUrl ? (
              <img
                src={chat.avatarUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <UserRound className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
            )}
          </div>
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
            <p className={`truncate text-[15px] sm:text-base ${hasUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
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
    </li>
  );
}
