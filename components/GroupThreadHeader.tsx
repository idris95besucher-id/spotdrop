"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { groupInfoHref } from "@/lib/groupChatRoutes";
import { MOBILE_SAFE_AREA_INSET_TOP } from "@/lib/mobileLayout";
import { navigateBack } from "@/lib/navigateBack";

type GroupThreadHeaderProps = {
  groupId: string;
  group: { name: string; photoUrl: string | null } | null;
  memberCount: number;
};

export default function GroupThreadHeader({ groupId, group, memberCount }: GroupThreadHeaderProps) {
  const { t } = useI18n();
  const router = useRouter();

  const handleBack = () => {
    navigateBack(router, "/chats", { preferFallback: true });
  };

  return (
    <header
      className={`relative z-[80] shrink-0 border-b border-white/[0.08] bg-[#050816] px-2 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP} sm:px-3`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleBack}
          className="relative z-[81] inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95 active:bg-white/15"
          aria-label={t("group.backToMessages")}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <Link
          href={groupInfoHref(groupId)}
          className="relative z-[81] flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1.5 py-1 transition duration-150 active:scale-[0.98] active:opacity-85"
          aria-label={t("group.chatInfo")}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/10">
            {group?.photoUrl ? (
              <img src={group.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Users className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1 text-left">
            <h1 className="truncate text-[15px] font-semibold leading-tight text-white">
              {group?.name ?? t("group.chatInfo")}
            </h1>
            {memberCount > 0 ? (
              <p className="mt-0.5 truncate text-xs text-muted">
                {memberCount === 1
                  ? t("group.membersCountOne")
                  : t("group.membersCountMany", { count: memberCount })}
              </p>
            ) : null}
          </div>
        </Link>
      </div>
    </header>
  );
}
