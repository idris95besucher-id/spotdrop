"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import VisitTabs from "@/components/VisitTabs";
import VisitExplorePanel from "@/components/visit/VisitExplorePanel";
import VisitMapPanel from "@/components/visit/VisitMapPanel";
import VisitNearbyPanel from "@/components/visit/VisitNearbyPanel";
import { useI18n } from "@/components/I18nProvider";
import { parseVisitTab, type VisitTab, visitTabHref } from "@/lib/visitTabs";

function VisitPageFallback() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} immersive>
      <div className="flex h-full items-center justify-center text-sm text-slate-400">{t("common.loading")}</div>
    </Shell>
  );
}

function VisitPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<VisitTab>(() => parseVisitTab(tabParam));

  useEffect(() => {
    setActiveTab(parseVisitTab(tabParam));
  }, [tabParam]);

  const handleTabChange = useCallback(
    (tab: VisitTab) => {
      setActiveTab(tab);
      router.replace(visitTabHref(tab), { scroll: false });
    },
    [router]
  );

  return (
    <Shell showHeader={false} immersive>
      <div className="flex h-full min-h-0 flex-col">
        <VisitTabs activeTab={activeTab} onTabChange={handleTabChange} />

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "explore" ? (
            <VisitExplorePanel />
          ) : activeTab === "nearby" ? (
            <VisitNearbyPanel />
          ) : (
            <VisitMapPanel />
          )}
        </div>
      </div>
    </Shell>
  );
}

export default function VisitPage() {
  return (
    <Suspense fallback={<VisitPageFallback />}>
      <VisitPageContent />
    </Suspense>
  );
}
