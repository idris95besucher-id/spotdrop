import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function resolveOfficialChannelUserId(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user?.id) {
    return null;
  }

  return data.user.id;
}

export async function assertOfficialPublisher(userId: string) {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return { admin: null, isOfficial: false as const, error: "SERVICE_UNAVAILABLE" as const };
  }

  const { data, error } = await admin
    .from("profiles")
    .select("is_official")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { admin, isOfficial: false as const, error: "PROFILE_LOOKUP_FAILED" as const };
  }

  if (data?.is_official !== true) {
    return { admin, isOfficial: false as const, error: "FORBIDDEN" as const };
  }

  return { admin, isOfficial: true as const, error: null };
}
