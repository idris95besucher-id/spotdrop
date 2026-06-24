"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/capacitorUtils";

const CAPACITOR_HOME = "/profile";

function isCapacitorHomePath(pathname: string) {
  return pathname === CAPACITOR_HOME || pathname === `${CAPACITOR_HOME}/`;
}

/** Client-side fallback: recover from bad in-app routes on Capacitor static export. */
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

  useEffect(() => {
    if (!isCapacitorNative()) {
      return;
    }

    const recover = () => {
      if (!isCapacitorHomePath(window.location.pathname)) {
        router.replace(CAPACITOR_HOME);
      }
    };

    window.addEventListener("popstate", recover);

    return () => {
      window.removeEventListener("popstate", recover);
    };
  }, [router]);

  return null;
}
