"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordNavigationPath } from "@/lib/navigateBack";

/** Keeps an in-app back stack for Capacitor / static-export navigation. */
export default function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams?.toString();
    const key = search ? `${pathname}?${search}` : pathname;
    recordNavigationPath(key);
  }, [pathname, searchParams]);

  return null;
}
