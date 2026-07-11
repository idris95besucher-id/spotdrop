"use client";

import type { ReactNode } from "react";
import { MOBILE_SAFE_AREA_TOP, MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

type ProfileAppHeaderProps = {
  actions?: ReactNode;
};

export default function ProfileAppHeader({ actions }: ProfileAppHeaderProps) {
  return (
    <header
      className={`flex w-full min-w-0 max-w-full items-center justify-between px-4 pb-2 ${MOBILE_SAFE_AREA_TOP} ${MOBILE_WIDTH_SAFE_CLASS}`}
    >
      <h1 className="min-w-0 truncate text-xl font-bold tracking-[-0.03em] text-white">
        Spot<span className="text-primary">Drop</span>
      </h1>
      {actions}
    </header>
  );
}
