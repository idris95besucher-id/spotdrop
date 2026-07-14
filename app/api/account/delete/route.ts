import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

async function resolveAuthenticatedUserId(request: Request) {
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

export async function POST(request: Request) {
  const userId = await resolveAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Account deletion is temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    console.error("[account/delete] admin.deleteUser failed", error.message);
    return NextResponse.json(
      { error: "Unable to delete your account. Please try again or contact support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
