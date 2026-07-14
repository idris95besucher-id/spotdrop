"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ClientRedirect from "@/components/ClientRedirect";

/**
 * Client-only /map → /visit?tab=map redirect that preserves ?mark= for deep links.
 * Must not read searchParams on the server (Capacitor static export).
 */
function MapToVisitRedirectInner() {
  const searchParams = useSearchParams();
  const href = useMemo(() => {
    const mark = searchParams.get("mark")?.trim() || "";
    if (mark) {
      return `/visit?tab=map&mark=${encodeURIComponent(mark)}`;
    }
    return "/visit?tab=map";
  }, [searchParams]);

  return <ClientRedirect href={href} />;
}

export default function MapToVisitRedirect() {
  return (
    <Suspense fallback={null}>
      <MapToVisitRedirectInner />
    </Suspense>
  );
}
