"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/authMessages";
import {
  clearLocalAuthSession,
  getSafeAuthSession,
  setAuthNotice,
  shouldHandleSessionExpiry,
} from "@/lib/authSession";
import { shouldRedirectExpiredSession } from "@/lib/authRoutes";
import { supabase } from "@/lib/supabaseClient";

type AuthSessionContextValue = {
  session: Session | null;
  loading: boolean;
  expired: boolean;
};

const AuthSessionContext = createContext<AuthSessionContextValue>({
  session: null,
  loading: true,
  expired: false,
});

export function useAuthSession() {
  return useContext(AuthSessionContext);
}

type AuthSessionProviderProps = {
  children: ReactNode;
};

export function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<AuthSessionContextValue>({
    session: null,
    loading: true,
    expired: false,
  });
  const redirectingRef = useRef(false);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      const initialSession = data.session ?? null;

      setState({
        session: initialSession,
        loading: false,
        expired: false,
      });

      if (!initialSession) {
        return;
      }

      const result = await getSafeAuthSession();

      if (!active) {
        return;
      }

      setState({
        session: result.session ?? initialSession,
        loading: false,
        expired: result.expired,
      });
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }

      setState((prev) => ({
        session,
        loading: false,
        expired: event === "SIGNED_OUT" ? prev.expired : false,
      }));

      if (event === "SIGNED_OUT" && !session) {
        void getSafeAuthSession().then((result) => {
          if (!active) {
            return;
          }

          setState({
            session: null,
            loading: false,
            expired: result.expired,
          });
        });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state.loading || !state.expired || redirectingRef.current) {
      return;
    }

    if (!shouldHandleSessionExpiry() || !shouldRedirectExpiredSession(pathname)) {
      return;
    }

    redirectingRef.current = true;

    void (async () => {
      await clearLocalAuthSession();
      setAuthNotice(SESSION_EXPIRED_MESSAGE);
      // Preserve the current path so the user returns here after re-logging in.
      const returnTo = pathname && pathname !== "/" ? `?returnTo=${encodeURIComponent(pathname)}` : "";
      router.replace(`/auth/login${returnTo}`);
    })();
  }, [state.loading, state.expired, pathname, router]);

  return (
    <AuthSessionContext.Provider value={state}>{children}</AuthSessionContext.Provider>
  );
}
