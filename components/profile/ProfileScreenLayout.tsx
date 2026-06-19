"use client";

import type { ReactNode } from "react";
import { MOBILE_SAFE_AREA_TOP, MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

type ProfileScreenLayoutProps = {
  children: ReactNode;
  header?: ReactNode;
  /** When true, apply safe-area top padding without a full header row (public profiles). */
  safeTop?: boolean;
  /** Tighter spacing for own profile. */
  compact?: boolean;
};

export default function ProfileScreenLayout({
  children,
  header,
  safeTop = false,
  compact = false,
}: ProfileScreenLayoutProps) {
  return (
    <div className={`flex flex-col ${MOBILE_WIDTH_SAFE_CLASS}`}>
      <div className={`mx-auto w-full min-w-0 max-w-lg px-4 sm:max-w-xl ${compact ? "pb-4" : "pb-6"}`}>
        {header}
        {safeTop && !header ? <div className={`${MOBILE_SAFE_AREA_TOP} shrink-0`} aria-hidden /> : null}
        <div className={`flex w-full min-w-0 flex-col ${compact ? "gap-2" : "gap-4"}`}>{children}</div>
      </div>
    </div>
  );
}
