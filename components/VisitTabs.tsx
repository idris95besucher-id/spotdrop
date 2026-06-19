"use client";

import { useI18n } from "@/components/I18nProvider";
import { MOBILE_SAFE_AREA_INSET_TOP } from "@/lib/mobileLayout";
import { VISIT_TABS, type VisitTab } from "@/lib/visitTabs";

type VisitTabsProps = {
  activeTab: VisitTab;
  onTabChange: (tab: VisitTab) => void;
};

const TAB_LABEL_KEYS = {
  explore: "visit.explore",
  nearby: "visit.nearby",
  map: "visit.map",
} as const;

export default function VisitTabs({ activeTab, onTabChange }: VisitTabsProps) {
  const { t } = useI18n();

  return (
    <div className={`grid shrink-0 grid-cols-3 border-b-2 border-white/10 bg-card ${MOBILE_SAFE_AREA_INSET_TOP}`}>
      {VISIT_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabChange(tab)}
          className={`py-3.5 text-center text-sm font-bold tracking-wide transition ${
            activeTab === tab
              ? "border-b-4 border-primary text-white"
              : "border-b-4 border-transparent text-muted hover:text-slate-200"
          }`}
        >
          {t(TAB_LABEL_KEYS[tab])}
        </button>
      ))}
    </div>
  );
}
