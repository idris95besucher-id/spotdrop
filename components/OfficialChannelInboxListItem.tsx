"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import ProfileAvatar from "@/components/ProfileAvatar";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import type { OfficialChannelInboxThread } from "@/lib/officialChannel";
import type { I18nLocale } from "@/lib/i18n/locales";
import type { TranslationKey } from "@/lib/i18n/messages";

type OfficialChannelInboxListItemProps = {
  thread: OfficialChannelInboxThread;
};

function formatInboxChatTime(
  createdAt: string,
  locale: I18nLocale,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfMessageDay.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  if (diffDays === 1) {
    return t("common.yesterday");
  }

  if (diffDays >= 2 && diffDays <= 6) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Synthetic SpotDrop Official row for the main Chats list.
 * Not a DM: no swipe-delete, mute, archive, or Message Request controls.
 */
export default function OfficialChannelInboxListItem({
  thread,
}: OfficialChannelInboxListItemProps) {
  const { t, locale } = useI18n();
  const hasUnread = thread.unread;
  const preview = thread.preview?.trim() || t("officialChannel.inboxEmptyPreview");
  const timeLabel = thread.lastAt ? formatInboxChatTime(thread.lastAt, locale, t) : "";

  return (
    <li className="relative select-none touch-manipulation">
      <Link
        href={thread.href}
        prefetch={false}
        aria-label={
          hasUnread
            ? t("officialChannel.inboxUnreadA11y")
            : t("officialChannel.inboxA11yLabel")
        }
        className={`flex items-center gap-3 px-4 py-3.5 transition sm:gap-4 sm:px-5 sm:py-4 ${
          hasUnread ? "bg-primary/[0.06]" : "hover:bg-white/[0.03]"
        }`}
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      >
        <div className="relative shrink-0">
          <ProfileAvatar
            src={thread.avatarUrl || "/icon.png"}
            alt="SpotDrop Official"
            sizeClassName="h-14 w-14 sm:h-16 sm:w-16"
            iconClassName="h-6 w-6"
            className="bg-white/[0.06]"
          />
          {hasUnread ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0B1026] bg-primary"
              aria-hidden
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <UsernameWithVerification
              username="SpotDrop Official"
              isVerified
              className={`min-w-0 text-[15px] sm:text-base ${
                hasUnread ? "font-bold text-white" : "font-semibold text-white"
              }`}
              iconSize={14}
            />
            {timeLabel ? (
              <time
                className={`shrink-0 text-xs ${
                  hasUnread ? "font-semibold text-primary" : "text-muted"
                }`}
                dateTime={thread.lastAt ?? undefined}
              >
                {timeLabel}
              </time>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-sm ${
                hasUnread ? "font-medium text-slate-200" : "text-muted"
              }`}
            >
              {preview}
            </p>
            {hasUnread ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-[#050816]">
                {t("officialChannel.unread")}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
