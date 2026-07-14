import {
  INVALID_CREDENTIALS_MESSAGE,
  mapAuthError,
} from "@/lib/authMessages";
import { clearLocalAuthSession } from "@/lib/authSession";
import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";
import { supabase } from "@/lib/supabaseClient";

function looksLikeEmail(value: string) {
  return value.includes("@");
}

type TokenSessionPayload = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

async function establishSessionFromTokens(payload: TokenSessionPayload) {
  if (!payload.access_token || !payload.refresh_token) {
    return { session: null, error: INVALID_CREDENTIALS_MESSAGE };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });

  if (error || !data.session) {
    return { session: null, error: mapAuthError(error, INVALID_CREDENTIALS_MESSAGE) };
  }

  return { session: data.session, error: null };
}

/**
 * Username sign-in resolves email only on the server (Edge Function or hosted API).
 * Never call resolve_login_email from the client — it is an email oracle.
 */
async function signInWithUsername(identifier: string, password: string) {
  const { data: fnData, error: fnError } = await supabase.functions.invoke("sign-in-with-identifier", {
    body: { identifier, password },
  });

  if (!fnError && fnData) {
    const payload = fnData as TokenSessionPayload;

    if (payload.access_token && payload.refresh_token) {
      return establishSessionFromTokens(payload);
    }

    if (payload.error) {
      return { session: null, error: mapAuthError(payload.error, INVALID_CREDENTIALS_MESSAGE) };
    }
  }

  const base = getHostedApiBaseUrl();
  const response = await fetch(`${base}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  const payload = (await response.json().catch(() => null)) as TokenSessionPayload | null;

  if (!response.ok || !payload) {
    return {
      session: null,
      error: mapAuthError(payload?.error, INVALID_CREDENTIALS_MESSAGE),
    };
  }

  return establishSessionFromTokens(payload);
}

export async function signInWithIdentifier(identifier: string, password: string) {
  await clearLocalAuthSession();

  const trimmed = identifier.trim();

  if (!trimmed) {
    return { session: null, error: INVALID_CREDENTIALS_MESSAGE };
  }

  if (!looksLikeEmail(trimmed)) {
    return signInWithUsername(trimmed, password);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  });

  if (error) {
    return { session: null, error: mapAuthError(error, INVALID_CREDENTIALS_MESSAGE) };
  }

  return { session: data.session, error: null };
}
