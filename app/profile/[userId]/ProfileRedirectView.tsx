"use client";

import { useParams } from "next/navigation";
import ClientRedirect from "@/components/ClientRedirect";

export default function ProfileUserIdRedirectPage() {
  const params = useParams();
  const userId = String(params.userId ?? "");

  if (!userId) {
    return null;
  }

  return <ClientRedirect href={`/user?id=${userId}`} />;
}
