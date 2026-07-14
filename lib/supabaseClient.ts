"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Exposed for callers that need to hit Supabase's REST endpoints directly
 * (e.g. a raw XHR storage upload for real progress — supabase-js's own
 * `fetch`-based client has no way to report upload progress). */
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
const hasPlaceholderUrl = supabaseUrl.includes("your-project-ref.supabase.co");

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local."
    : hasPlaceholderUrl
      ? "NEXT_PUBLIC_SUPABASE_URL in .env.local is still the example placeholder. Replace it with your real Supabase project URL."
      : null;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to your environment."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Recovery tokens are parsed manually on /auth/reset-password so the hash is not consumed early.
    detectSessionInUrl: false,
    persistSession: true,
  },
});

export function getSupabaseConfigDiagnostics() {
  return {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    url: supabaseUrl || null,
    urlPreview: supabaseUrl ? `${supabaseUrl.slice(0, 32)}…` : null,
    anonKeyPreview: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 12)}…` : null,
    hasPlaceholderUrl,
    configError: supabaseConfigError,
  };
}

/** Lightweight reachability check for debugging native clients (iOS/Capacitor). */
export async function probeSupabaseAuthHealth() {
  if (!supabaseUrl) {
    return { ok: false as const, error: "NEXT_PUBLIC_SUPABASE_URL is missing" };
  }

  const healthUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`;

  try {
    const response = await fetch(healthUrl, { method: "GET" });
    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body,
      healthUrl,
      error: response.ok ? null : body || `HTTP ${response.status}`,
    };
  } catch (caught) {
    return {
      ok: false as const,
      healthUrl,
      error: caught instanceof Error ? caught.message : String(caught),
    };
  }
}
