"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
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
