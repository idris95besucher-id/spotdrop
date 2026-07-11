"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProfileGalleryScreen from "@/components/profile/ProfileGalleryScreen";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";

function UserGalleryContent() {
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
    <ProfileGalleryScreen
      ownerUserId={ownerUserId}
      backHref={`/user?id=${encodeURIComponent(ownerUserId)}`}
    />
  );
}

export default function UserGalleryPage() {
  const { t } = useI18n();

  return (
    <Suspense fallback={<div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>}>
      <UserGalleryContent />
    </Suspense>
  );
}
