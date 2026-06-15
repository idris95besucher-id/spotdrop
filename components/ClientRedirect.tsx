"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Client-side redirect for static export (Capacitor) where server redirects are unavailable. */
export default function ClientRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return null;
}
