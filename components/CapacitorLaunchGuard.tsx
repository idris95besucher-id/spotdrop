"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/capacitorUtils";

const CAPACITOR_HOME = "/profile";

/**
 * Client-side fallback for native launches only.
 * Must NEVER hijack in-app navigation (Visit → country → city) or back stack.
 */
export default function CapacitorLaunchGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isCapacitorNative()) {
      return;
    }

    if (pathname.includes("capacitor-error")) {
      router.replace(CAPACITOR_HOME);
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      router.replace(CAPACITOR_HOME);
    }
  }, [pathname, router]);

  return null;
}
