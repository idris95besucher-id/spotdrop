"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import DmHeaderPresenceLabel from "@/components/DmHeaderPresenceLabel";
import ProfileAvatar from "@/components/ProfileAvatar";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { useI18n } from "@/components/I18nProvider";
import { MOBILE_SAFE_AREA_INSET_TOP } from "@/lib/mobileLayout";
import { navigateBack } from "@/lib/navigateBack";
import { publicProfileUsername } from "@/lib/publicProfile";
import type { DmPartnerPresenceStatus } from "@/lib/userPresence";

type DmThreadHeaderProps = {
  backHref?: string;
  partnerId?: string | null;
  partner: {
    username: string;
    avatar_url?: string | null;
    is_verified?: boolean | null;
  } | null;
  presence: DmPartnerPresenceStatus;
  isSelfConversation: boolean;
  canSeePartnerPresence?: boolean | null;
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
  const router = useRouter();
  const profileHref = partnerId ? `/user?id=${partnerId}` : null;

  const handleBack = () => {
    navigateBack(router, backHref, { preferFallback: true });
  };

  const profileContent = (
    <>
      <ProfileAvatar
        src={partner?.avatar_url}
        sizeClassName="h-9 w-9"
        iconClassName="h-4 w-4"
        iconStrokeWidth={1.75}
        className="bg-white/[0.06] ring-1 ring-white/10"
      />

      <div className="min-w-0 flex-1 text-left">
        <h1 className="max-w-full">
          {partner ? (
            <UsernameWithVerification
              username={publicProfileUsername(partner.username)}
              isVerified={partner.is_verified}
              className="text-[15px] font-semibold leading-tight text-white"
              iconSize={13}
            />
          ) : (
            <span className="truncate text-[15px] font-semibold leading-tight text-white">
              {t("dm.chat")}
            </span>
          )}
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
      className={`relative z-[80] shrink-0 border-b border-white/[0.08] bg-[#050816] px-2 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP} sm:px-3`}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center gap-1">
        <button
          type="button"
          onClick={handleBack}
          className="relative z-[81] inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95 active:bg-white/15 pointer-events-auto"
          aria-label={t("dm.backToMessages")}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        {profileHref && partner ? (
          <Link
            href={profileHref}
            className="relative z-[81] flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1.5 py-1 transition duration-150 active:scale-[0.98] active:opacity-85"
            aria-label={t("profile.viewProfile")}
          >
            {profileContent}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 px-1.5 py-1">{profileContent}</div>
        )}

        {trailing ? <div className="relative z-[81] shrink-0">{trailing}</div> : null}
      </div>
    </header>
  );
}
