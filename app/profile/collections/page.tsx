"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Collections removed — open profile Saved tab instead. */
export default function ProfileCollectionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    window.sessionStorage.setItem("spotdrop:profile-tab", "saved");
    router.replace("/profile");
  }, [router]);

  return null;
}
