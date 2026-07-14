"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Collections removed — redirect to private Saved on profile. */
export default function CollectionView(_props: { collectionIdOverride?: string }) {
  const router = useRouter();

  useEffect(() => {
    window.sessionStorage.setItem("spotdrop:profile-tab", "saved");
    router.replace("/profile");
  }, [router]);

  return null;
}
