"use client";

import { useI18n } from "@/components/I18nProvider";
import { CHATS_INBOX_TABS, type ChatsInboxTab } from "@/lib/chatsTabs";
import type { TranslationKey } from "@/lib/i18n/messages";

const TAB_LABEL_KEYS: Record<ChatsInboxTab, TranslationKey> = {
  direct: "chats.tab.direct",
  groups: "chats.tab.groups",
  rooms: "chats.tab.rooms",
};

type ChatsInboxTabBarProps = {
  activeTab: ChatsInboxTab;
  onTabChange: (tab: ChatsInboxTab) => void;
};

export default function ChatsInboxTabBar({ activeTab, onTabChange }: ChatsInboxTabBarProps) {
  const { t } = useI18n();
  const activeIndex = Math.max(0, CHATS_INBOX_TABS.indexOf(activeTab));
  const indicatorCenter = `${((activeIndex + 0.5) / CHATS_INBOX_TABS.length) * 100}%`;

  return (
    <div role="tablist" aria-label={t("nav.myChats")} className="relative mt-3 grid grid-cols-3 border-b border-white/10">
      {CHATS_INBOX_TABS.map((tab) => {
        const selected = activeTab === tab;

        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onTabChange(tab)}
            className={`relative px-1 py-2.5 text-center text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150 ${
              selected ? "text-primary" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t(TAB_LABEL_KEYS[tab])}
          </button>
        );
      })}

      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 h-[2.5px] w-12 -translate-x-1/2 rounded-full bg-primary transition-[left] duration-200 ease-out"
        style={{ left: indicatorCenter }}
      />
    </div>
  );
}
