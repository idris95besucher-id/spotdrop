"use client";

import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { MOBILE_PAGE_INNER_CLASS } from "@/lib/mobileLayout";

export default function SettingsScreenLayout({ children }: { children: ReactNode }) {
  return (
    <Shell showHeader={false} flushTop>
      <div className={`${MOBILE_PAGE_INNER_CLASS} space-y-6 pb-6`}>{children}</div>
    </Shell>
  );
}
