import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export const AUTH_CONNECTION_ERROR_MESSAGE = "Connection problem. Please try again.";

type AuthErrorDetails = {
  name: string | null;
  message: string | null;
  status: number | string | null;
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
  console.error("Auth session error:", JSON.stringify(authErrorDetails(error), null, 2));
}

export async function getSafeAuthSession(): Promise<{
  session: Session | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      logAuthSessionError(error);
      return { session: null, error: AUTH_CONNECTION_ERROR_MESSAGE };
    }

    return { session: data.session ?? null, error: null };
  } catch (error) {
    logAuthSessionError(error);
    return { session: null, error: AUTH_CONNECTION_ERROR_MESSAGE };
  }
}
