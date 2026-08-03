"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import UserConnectionsListScreen from "@/components/profile/UserConnectionsListScreen";
import { useI18n } from "@/components/I18nProvider";

function UserFollowersContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const ownerUserId = searchParams.get("id")?.trim() ?? "";

  if (!ownerUserId) {
    return (
      <Shell showHeader={false} flushTop>
        <div className="px-4 py-12 text-center text-sm text-slate-400">{t("profile.userNotFound")}</div>
      </Shell>
    );
  }

  return (
    <UserConnectionsListScreen
      ownerUserId={ownerUserId}
      listType="followers"
      backHref={`/user?id=${encodeURIComponent(ownerUserId)}`}
    />
  );
}

export default function UserFollowersPage() {
  const { t } = useI18n();

  return (
    <Suspense fallback={<div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>}>
      <UserFollowersContent />
    </Suspense>
  );
}
