"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import Shell from "@/components/Shell";

export default function StudyRedirectPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    router.replace("/visit?tab=map");
  }, [router]);

  return (
    <Shell showHeader={false}>
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-slate-400">{t("study.redirecting")}</p>
      </div>
    </Shell>
  );
}
