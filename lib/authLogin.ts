import {
  INVALID_CREDENTIALS_MESSAGE,
  mapAuthError,
} from "@/lib/authMessages";
import { clearLocalAuthSession } from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;

function looksLikeEmail(value: string) {
  return value.includes("@");
}

/**
 * Resolve email for sign-in. Email passes through; username uses RPC
 * `resolve_login_email` (see database/add-auth-username-login.sql).
 */
export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();

  if (!trimmed) {
    return null;
  }

  if (looksLikeEmail(trimmed)) {
    return trimmed;
  }

  const normalizedUsername = trimmed.toLowerCase();

  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return null;
  }

  const { data, error } = await supabase.rpc("resolve_login_email", {
    identifier: normalizedUsername,
  });

  if (error) {
    console.error("Username login lookup failed:", error.code ?? "unknown");
    return null;
  }

  const email = typeof data === "string" ? data.trim() : null;

  return email || null;
}

export async function signInWithIdentifier(identifier: string, password: string) {
  await clearLocalAuthSession();

  const email = await resolveLoginEmail(identifier);

  if (!email) {
    return { session: null, error: INVALID_CREDENTIALS_MESSAGE };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { session: null, error: mapAuthError(error, INVALID_CREDENTIALS_MESSAGE) };
  }

  return { session: data.session, error: null };
}
