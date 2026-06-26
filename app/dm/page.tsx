"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DmThreadView from "./[userId]/DmThreadView";

function DmPageContent() {
  const searchParams = useSearchParams();
  const partnerId = searchParams.get("id") ?? "";

  console.log("[DM SCREEN] app/dm/page.tsx", { partnerId });

  return <DmThreadView partnerIdOverride={partnerId} />;
}

export default function DmPage() {
  return (
    <Suspense>
      <DmPageContent />
    </Suspense>
  );
}
