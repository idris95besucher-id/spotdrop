"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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

function sessionsEqual(previous: Session | null, next: Session | null) {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return !previous && !next;
  }

  return (
    previous.access_token === next.access_token &&
    previous.expires_at === next.expires_at &&
    previous.user?.id === next.user?.id
  );
}

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
      const SESSION_BOOTSTRAP_TIMEOUT_MS = 12_000;

      const withTimeout = <T,>(promise: Promise<T>) =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            window.setTimeout(() => reject(new Error("session_timeout")), SESSION_BOOTSTRAP_TIMEOUT_MS);
          }),
        ]);

      try {
        const { data } = await withTimeout(supabase.auth.getSession());

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

        const result = await withTimeout(getSafeAuthSession());

        if (!active) {
          return;
        }

        setState({
          session: result.session ?? initialSession,
          loading: false,
          expired: result.expired,
        });
      } catch {
        if (!active) {
          return;
        }

        setState({
          session: null,
          loading: false,
          expired: false,
        });
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }

      setState((prev) => {
        const nextExpired = event === "SIGNED_OUT" ? prev.expired : false;

        if (
          prev.loading === false &&
          prev.expired === nextExpired &&
          sessionsEqual(prev.session, session)
        ) {
          return prev;
        }

        return {
          session,
          loading: false,
          expired: nextExpired,
        };
      });

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

  const contextValue = useMemo(
    () => state,
    [state.session, state.loading, state.expired]
  );

  return (
    <AuthSessionContext.Provider value={contextValue}>{children}</AuthSessionContext.Provider>
  );
}
