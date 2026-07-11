"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, UserRound } from "lucide-react";
import DmHeaderPresenceLabel from "@/components/DmHeaderPresenceLabel";
import { useI18n } from "@/components/I18nProvider";
import { MOBILE_SAFE_AREA_INSET_TOP } from "@/lib/mobileLayout";
import { publicProfileUsername } from "@/lib/publicProfile";
import type { DmPartnerPresenceStatus } from "@/lib/userPresence";

type DmThreadHeaderProps = {
  backHref?: string;
  partnerId?: string | null;
  partner: {
    username: string;
    avatar_url?: string | null;
  } | null;
  presence: DmPartnerPresenceStatus;
  isSelfConversation: boolean;
  canSeePartnerPresence?: boolean | null;
  /** Optional trailing control (e.g. overflow menu) — stays outside the profile tap target. */
  trailing?: ReactNode;
};

/** Instagram-style DM header — always pinned at top of the DM shell. */
export default function DmThreadHeader({
  backHref = "/chats",
  partnerId,
  partner,
  presence,
  isSelfConversation,
  canSeePartnerPresence = true,
  trailing,
}: DmThreadHeaderProps) {
  const { t } = useI18n();
  const profileHref = partnerId ? `/user?id=${partnerId}` : null;

  const profileContent = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/10">
        {partner?.avatar_url ? (
          <img src={partner.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1 text-left">
        <h1 className="truncate text-[15px] font-semibold leading-tight text-white">
          {partner ? publicProfileUsername(partner.username) : t("dm.chat")}
        </h1>
        {partner && !isSelfConversation ? (
          canSeePartnerPresence === false ? (
            <p className="mt-0.5 truncate text-xs text-muted">{t("presence.hidden")}</p>
          ) : canSeePartnerPresence === true ? (
            <DmHeaderPresenceLabel presence={presence} className="mt-0.5" />
          ) : null
        ) : null}
      </div>
    </>
  );

  return (
    <header
      className={`relative z-50 shrink-0 border-b border-white/[0.08] bg-[#050816] px-2 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP} sm:px-3`}
    >
      <div className="flex items-center gap-1">
        <Link
          href={backHref}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95 active:opacity-80"
          aria-label={t("dm.backToMessages")}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>

        {profileHref && partner ? (
          <Link
            href={profileHref}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1.5 py-1 transition duration-150 active:scale-[0.98] active:opacity-85"
            aria-label={t("profile.viewProfile")}
          >
            {profileContent}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 px-1.5 py-1">{profileContent}</div>
        )}

        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  );
}
