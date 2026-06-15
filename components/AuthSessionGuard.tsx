"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/authMessages";
import {
  clearLocalAuthSession,
  getSafeAuthSession,
  setAuthNotice,
  shouldHandleSessionExpiry,
} from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";

function isAuthRoute(pathname: string | null) {
  return pathname?.startsWith("/auth") ?? false;
}

type AuthSessionGuardProps = {
  children: ReactNode;
};

export default function AuthSessionGuard({ children }: AuthSessionGuardProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const redirectExpiredSession = async () => {
      if (!active || isAuthRoute(pathname) || !shouldHandleSessionExpiry()) {
        return;
      }

      await clearLocalAuthSession();
      setAuthNotice(SESSION_EXPIRED_MESSAGE);
      router.replace("/auth/login");
    };

    void getSafeAuthSession().then((result) => {
      if (!active) {
        return;
      }

      if (result.expired) {
        void redirectExpiredSession();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }

      if (event === "SIGNED_OUT" && !session && !isAuthRoute(pathname)) {
        void getSafeAuthSession().then((result) => {
          if (result.expired) {
            void redirectExpiredSession();
          }
        });
      }

      if (event === "TOKEN_REFRESHED" && !session && !isAuthRoute(pathname)) {
        void redirectExpiredSession();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  return children;
}
