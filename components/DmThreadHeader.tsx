"use client";

import Link from "next/link";
import { ChevronLeft, UserRound } from "lucide-react";
import DmHeaderPresenceLabel from "@/components/DmHeaderPresenceLabel";
import { useI18n } from "@/components/I18nProvider";
import { MOBILE_SAFE_AREA_INSET_TOP } from "@/lib/mobileLayout";
import { publicProfileUsername } from "@/lib/publicProfile";

type DmThreadHeaderProps = {
  backHref?: string;
  partner: {
    username: string;
    avatar_url?: string | null;
  } | null;
  partnerLastSeenAt: string | null;
  partnerIsOnline: boolean;
  isSelfConversation: boolean;
  canSeePartnerPresence?: boolean | null;
};

/** Instagram-style DM header — always pinned at top of the DM shell. */
export default function DmThreadHeader({
  backHref = "/chats",
  partner,
  partnerLastSeenAt,
  partnerIsOnline,
  isSelfConversation,
  canSeePartnerPresence = true,
}: DmThreadHeaderProps) {
  const { t } = useI18n();

  return (
    <header
      className={`relative z-50 shrink-0 border-b border-white/[0.08] bg-[#050816] px-2 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP} sm:px-3`}
    >
      <div className="flex items-center gap-1">
        <Link
          href={backHref}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80"
          aria-label={t("dm.backToMessages")}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/10">
            {partner?.avatar_url ? (
              <img src={partner.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight text-white">
              {partner ? publicProfileUsername(partner.username) : t("dm.chat")}
            </h1>
            {partner && !isSelfConversation ? (
              canSeePartnerPresence === false ? (
                <p className="mt-0.5 truncate text-xs text-muted">{t("presence.hidden")}</p>
              ) : canSeePartnerPresence === true ? (
                <DmHeaderPresenceLabel
                  presence={{ isOnline: partnerIsOnline, lastSeenAt: partnerLastSeenAt }}
                  className="mt-0.5"
                />
              ) : null
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
