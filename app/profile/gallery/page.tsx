"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import ProfileGalleryScreen from "@/components/profile/ProfileGalleryScreen";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";

export default function ProfileGalleryPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSafeAuthSession().then((result) => {
      setSession(result.session);
      setLoading(false);

      if (!result.session?.user) {
        router.replace("/auth/login");
      }
    });
  }, [router]);

  if (loading) {
    return (
      <Shell showHeader={false} flushTop>
        <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
      </Shell>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <Suspense fallback={<div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>}>
      <ProfileGalleryScreen
        ownerUserId={session.user.id}
        backHref="/profile"
        requireAuth
      />
    </Suspense>
  );
}
