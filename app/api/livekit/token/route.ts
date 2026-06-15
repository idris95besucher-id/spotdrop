import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

type TokenRequestBody = {
  roomName?: string;
  identity?: string;
  canPublish?: boolean;
};

export async function POST(request: Request) {
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? "";
  const apiKey = process.env.LIVEKIT_API_KEY ?? "";
  const apiSecret = process.env.LIVEKIT_API_SECRET ?? "";

  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET." },
      { status: 503 }
    );
  }

  let body: TokenRequestBody;
  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const roomName = body.roomName?.trim() ?? "";
  const identity = body.identity?.trim() ?? "";

  if (!roomName || !identity) {
    return NextResponse.json({ error: "roomName and identity are required." }, { status: 400 });
  }

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
