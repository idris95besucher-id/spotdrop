import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type SignInBody = {
  identifier?: string;
  password?: string;
};

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;
const INVALID = "Email or password is incorrect.";

function looksLikeEmail(value: string) {
  return value.includes("@");
}

async function resolveEmailForIdentifier(identifier: string) {
  const trimmed = identifier.trim();

  if (!trimmed) {
    return null;
  }

  if (looksLikeEmail(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();

  if (!USERNAME_REGEX.test(normalized)) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", normalized)
    .maybeSingle();

  if (!profile?.id) {
    return null;
  }

  const { data: userData, error } = await admin.auth.admin.getUserById(profile.id);

  if (error || !userData.user?.email) {
    return null;
  }

  return userData.user.email;
}

export async function POST(request: Request) {
  let body: SignInBody;

  try {
    body = (await request.json()) as SignInBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const identifier = body.identifier?.trim() ?? "";
  const password = body.password ?? "";

  if (!identifier || !password) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const email = await resolveEmailForIdentifier(identifier);

  if (!email) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    user: {
      id: data.user.id,
    },
  });
}
