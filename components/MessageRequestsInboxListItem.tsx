"use client";

import Link from "next/link";
import { ChevronRight, MessageSquareDot } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatUnreadBadge } from "@/lib/chatNotifications";

type MessageRequestsInboxListItemProps = {
  count: number;
};

export default function MessageRequestsInboxListItem({ count }: MessageRequestsInboxListItemProps) {
  const { t } = useI18n();

  if (count <= 0) {
    return null;
  }

  const badge = formatUnreadBadge(count);
  const subtitle =
    count === 1
      ? t("chats.messageRequestsCountOne")
      : t("chats.messageRequestsCountMany", { count });

  return (
    <li className="relative select-none touch-manipulation">
      <Link
        href="/chats/requests"
        prefetch={false}
        aria-label={`${t("chats.messageRequests")}. ${subtitle}`}
        className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-white/[0.03] active:bg-white/[0.05] sm:gap-4 sm:px-5 sm:py-4"
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/[0.06] sm:h-16 sm:w-16">
          <MessageSquareDot className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white sm:text-base">
            {t("chats.messageRequests")}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {badge ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {badge}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
        </div>
      </Link>
    </li>
  );
}
