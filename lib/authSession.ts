import type { Session } from "@supabase/supabase-js";
import {
  AUTH_CONNECTION_ERROR_MESSAGE,
  consumeIntentionalSignOut,
  isStaleSessionError,
  SESSION_EXPIRED_MESSAGE,
  shouldLogAuthError,
} from "@/lib/authMessages";
import { supabase } from "@/lib/supabaseClient";

function isBrowserOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export {
  AUTH_CONNECTION_ERROR_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from "@/lib/authMessages";
export { isInvalidCredentialsError, isStaleSessionError } from "@/lib/authMessages";

export const AUTH_NOTICE_STORAGE_KEY = "spotdrop_auth_notice";

type AuthErrorDetails = {
  name: string | null;
  message: string | null;
  status: number | string | null;
};

export type SafeAuthSessionResult = {
  session: Session | null;
  error: string | null;
  expired: boolean;
};

function authErrorDetails(error: unknown): AuthErrorDetails {
  const maybeError = error as { name?: unknown; message?: unknown; status?: unknown };

  return {
    name: typeof maybeError?.name === "string" ? maybeError.name : error instanceof Error ? error.name : null,
    message: typeof maybeError?.message === "string" ? maybeError.message : error instanceof Error ? error.message : null,
    status:
      typeof maybeError?.status === "number" || typeof maybeError?.status === "string"
        ? maybeError.status
        : null,
  };
}

export function logAuthSessionError(error: unknown) {
  if (!shouldLogAuthError(error)) {
    return;
  }

  console.error("Auth session error:", JSON.stringify(authErrorDetails(error), null, 2));
}

export async function clearLocalAuthSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Local storage may already be cleared.
  }
}

export function setAuthNotice(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(AUTH_NOTICE_STORAGE_KEY, message);
}

export function consumeAuthNotice() {
  if (typeof window === "undefined") {
    return null;
  }

  const message = sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY);

  if (message) {
    sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
  }

  return message;
}

export async function getSafeAuthSession(): Promise<SafeAuthSessionResult> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      if (isStaleSessionError(error)) {
        await clearLocalAuthSession();
        return { session: null, error: null, expired: true };
      }

      return { session: null, error: AUTH_CONNECTION_ERROR_MESSAGE, expired: false };
    }

    const session = data.session ?? null;

    if (!session) {
      return { session: null, error: null, expired: false };
    }

    if (isBrowserOffline()) {
      return { session, error: null, expired: false };
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isStaleSessionError(userError)) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshed.session) {
          return { session: refreshed.session, error: null, expired: false };
        }

        if (refreshError && isStaleSessionError(refreshError)) {
          await clearLocalAuthSession();
          return { session: null, error: null, expired: true };
        }

        return { session, error: null, expired: false };
      }

      return { session, error: AUTH_CONNECTION_ERROR_MESSAGE, expired: false };
    }

    if (!userData.user) {
      return { session, error: null, expired: false };
    }

    return { session, error: null, expired: false };
  } catch (error) {
    if (isStaleSessionError(error)) {
      await clearLocalAuthSession();
      return { session: null, error: null, expired: true };
    }

    if (isBrowserOffline()) {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session ?? null;

        if (session) {
          return { session, error: null, expired: false };
        }
      } catch {
        // Fall through to connection error.
      }
    }

    return { session: null, error: AUTH_CONNECTION_ERROR_MESSAGE, expired: false };
  }
}

/** Redirect helper for expired sessions (skip after intentional sign-out). */
export function shouldHandleSessionExpiry() {
  return !consumeIntentionalSignOut();
}
