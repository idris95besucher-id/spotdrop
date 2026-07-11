"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Opens profile with Collections tab selected. */
export default function ProfileCollectionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    window.sessionStorage.setItem("spotdrop:profile-tab", "collections");
    router.replace("/profile");
  }, [router]);

  return null;
}
