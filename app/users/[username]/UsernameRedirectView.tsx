"use client";

import { useParams } from "next/navigation";
import ClientRedirect from "@/components/ClientRedirect";

export default function UsersProfileRedirectPage() {
  const params = useParams();
  const username = String(params.username ?? "");

  if (!username) {
    return null;
  }

  return <ClientRedirect href={`/user/${encodeURIComponent(username)}`} />;
}
