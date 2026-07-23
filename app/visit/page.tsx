"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import ProfileAppHeader from "@/components/profile/ProfileAppHeader";
import VisitExplorePanel from "@/components/visit/VisitExplorePanel";
import VisitMapPanel from "@/components/visit/VisitMapPanel";
import VisitNearbyPanel from "@/components/visit/VisitNearbyPanel";
import { useI18n } from "@/components/I18nProvider";
import { parseVisitTab } from "@/lib/visitTabs";

function VisitPageFallback() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} immersive>
      <div className="flex h-full items-center justify-center text-sm text-slate-400">{t("common.loading")}</div>
    </Shell>
  );
}

function VisitPageContent() {
  const searchParams = useSearchParams();
  // Derive from URL every render — no local tab state that can stick on Map after
  // tapping the airplane (/visit?tab=explore) from /visit?tab=map.
  const activeTab = parseVisitTab(searchParams.get("tab"));
  const isMapTab = activeTab === "map";

  return (
    <Shell
      showHeader={false}
      immersive
      topBar={
        isMapTab ? undefined : <ProfileAppHeader />
      }
    >
      <div className="flex h-full min-h-0 select-none touch-manipulation flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">
          {isMapTab ? (
            <VisitMapPanel />
          ) : activeTab === "nearby" ? (
            <VisitNearbyPanel />
          ) : (
            <VisitExplorePanel />
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
