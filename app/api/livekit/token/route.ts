import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type TokenRequestBody = {
  roomName?: string;
  identity?: string;
  canPublish?: boolean;
};

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
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? "";
  const apiKey = process.env.LIVEKIT_API_KEY ?? "";
  const apiSecret = process.env.LIVEKIT_API_SECRET ?? "";

  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit is not configured." },
      { status: 503 }
    );
  }

  const userId = await resolveAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: TokenRequestBody;
  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const roomName = body.roomName?.trim() ?? "";

  if (!roomName) {
    return NextResponse.json({ error: "roomName is required." }, { status: 400 });
  }

  // Always bind LiveKit identity to the authenticated user — never trust client identity.
  const identity = userId;
  const canPublish = body.canPublish === true;

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "2h",
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
  });

  const jwt = await token.toJwt();

  return NextResponse.json({
    token: jwt,
    url: livekitUrl,
  });
}
