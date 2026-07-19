import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REQUIRED_ADMIN_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type SupabaseAdminEnvName = (typeof REQUIRED_ADMIN_ENV)[number];

export type SupabaseAdminConfig = {
  ok: boolean;
  missing: SupabaseAdminEnvName[];
  hasUrl: boolean;
  hasServiceRoleKey: boolean;
};

/**
 * Reports which admin-client env vars are present (names only — never values).
 */
export function getSupabaseAdminConfig(): SupabaseAdminConfig {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const missing = REQUIRED_ADMIN_ENV.filter((name) => {
    if (name === "NEXT_PUBLIC_SUPABASE_URL") {
      return !hasUrl;
    }
    return !hasServiceRoleKey;
  });

  return {
    ok: missing.length === 0,
    missing: [...missing],
    hasUrl,
    hasServiceRoleKey,
  };
}

export function getSupabaseAdminMissingEnvMessage(config = getSupabaseAdminConfig()) {
  if (config.ok) {
    return null;
  }

  return `Supabase admin client not configured. Missing: ${config.missing.join(", ")}.`;
}

let loggedMissingEnv = false;

/**
 * Service-role Supabase client for server routes.
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (exact names).
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const config = getSupabaseAdminConfig();

  if (!config.ok) {
    if (!loggedMissingEnv) {
      loggedMissingEnv = true;
      console.error("[PushServer][step 2] FAIL Supabase admin client not configured", {
        missing: config.missing,
        hasUrl: config.hasUrl,
        hasServiceRoleKey: config.hasServiceRoleKey,
        expected: [...REQUIRED_ADMIN_ENV],
      });
    }
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
