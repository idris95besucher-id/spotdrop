"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatGroupChatPreview } from "@/lib/i18n/chatPreview";
import type { GroupChatSummary } from "@/lib/groupChats";
import { groupThreadHref } from "@/lib/groupChatRoutes";
import { useLongPress } from "@/lib/useLongPress";

type GroupInboxListItemProps = {
  group: GroupChatSummary;
  onLongPress: (group: GroupChatSummary) => void;
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

export default function GroupInboxListItem({ group, onLongPress }: GroupInboxListItemProps) {
  const { t } = useI18n();
  const router = useRouter();
  const href = groupThreadHref(group.id);
  const hasUnread = group.unreadCount > 0;
  const preview = formatGroupChatPreview(group.lastMessage, group.lastMessageType, t);

  const { longPressProps, onClickCapture } = useLongPress({
    onLongPress: () => onLongPress(group),
  });

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
            {group.photoUrl ? (
              <img
                src={group.photoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <Users className="h-6 w-6 text-primary" strokeWidth={1.5} aria-hidden />
            )}
          </div>
          {hasUnread ? (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0B1026] bg-primary" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-[15px] sm:text-base ${hasUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
              {group.name}
            </p>
            <time className={`shrink-0 text-xs ${hasUnread ? "font-semibold text-primary" : "text-muted"}`}>
              {formatChatTime(group.lastAt)}
            </time>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className={`min-w-0 truncate text-sm ${hasUnread ? "font-medium text-slate-200" : "text-muted"}`}>
              {preview}
            </p>
            {hasUnread && group.unreadBadge ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-[#050816]">
                {group.unreadBadge}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
