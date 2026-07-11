"use client";

import { Suspense } from "react";
import { DesktopMainNav } from "@/components/MainNavigation";

/** Desktop header navigation (mobile uses fixed bottom bar in Shell). */
export default function AuthStatus() {
  return (
    <Suspense fallback={null}>
      <DesktopMainNav />
    </Suspense>
  );
}
