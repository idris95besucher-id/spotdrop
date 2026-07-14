import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";
import { supabase } from "@/lib/supabaseClient";

export type DeleteAccountResult = {
  ok: boolean;
  error: string | null;
};

/**
 * Permanently deletes the signed-in auth user via service-role backends.
 * Tries Supabase Edge Function first (works in Capacitor), then hosted API.
 */
export async function deleteCurrentAccount(): Promise<DeleteAccountResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return { ok: false, error: "Session expired. Please log in again." };
  }

  const { data: fnData, error: fnError } = await supabase.functions.invoke("delete-account", {
    method: "POST",
  });

  if (!fnError) {
    const payload = fnData as { ok?: boolean; error?: string } | null;

    if (payload?.ok) {
      return { ok: true, error: null };
    }

    if (payload?.error) {
      return { ok: false, error: payload.error };
    }
  }

  const base = getHostedApiBaseUrl();
  const response = await fetch(`${base}/api/account/delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

  if (!response.ok) {
    return {
      ok: false,
      error: body?.error || "Unable to delete your account. Please try again or contact support.",
    };
  }

  return { ok: true, error: null };
}
