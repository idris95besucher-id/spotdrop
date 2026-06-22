"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import UserProfileView from "./[userId]/UserProfileView";

function UserPageContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("id") ?? "";
  return <UserProfileView userIdOverride={userId} />;
}

export default function UserPage() {
  return (
    <Suspense>
      <UserPageContent />
    </Suspense>
  );
}
