import { NextResponse } from "next/server";
import { getFirebaseAdminMessaging, isFcmConfigured } from "@/lib/firebaseAdmin";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { PUSH_SOUND, sendFcmToUser } from "@/lib/serverPushSend";

/**
 * Production push self-test.
 * Auth: header x-spotdrop-selftest must equal PUSH_SELFTEST_KEY.
 *
 * Only sends FCM to an existing iOS token owner. Never inserts DMs, never
 * creates/renames profiles, never creates visible conversations.
 */
export async function POST(request: Request) {
  const expected = process.env.PUSH_SELFTEST_KEY?.trim() ?? "";
  const provided = request.headers.get("x-spotdrop-selftest")?.trim() ?? "";

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Admin client missing." }, { status: 503 });
  }

  if (!isFcmConfigured() || !getFirebaseAdminMessaging()) {
    return NextResponse.json({ error: "FCM not configured." }, { status: 503 });
  }

  let firebaseProjectId: string | null = null;
  let serviceAccountEmail: string | null = null;
  let googleAccessTokenOk = false;
  let googleAccessTokenError: string | null = null;

  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}") as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    firebaseProjectId = sa.project_id ?? null;
    serviceAccountEmail = sa.client_email ?? null;

    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      credentials: sa,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    googleAccessTokenOk = Boolean(tokenResponse.token);
  } catch (error) {
    googleAccessTokenError = error instanceof Error ? error.message : String(error);
  }

  const { data: tokens, error: tokenError } = await admin
    .from("user_push_tokens")
    .select("user_id, platform, token, updated_at")
    .order("updated_at", { ascending: false });

  if (tokenError) {
    return NextResponse.json({ error: tokenError.message }, { status: 500 });
  }

  const ios = (tokens ?? []).filter((row) => String(row.platform).toLowerCase() === "ios");
  if (ios.length === 0) {
    return NextResponse.json({ error: "No iOS tokens in user_push_tokens." }, { status: 404 });
  }

  const targetUserId = String(ios[0].user_id);

  // Reject any request that asks for the old conversation-creating mode.
  const body = await request.json().catch(() => ({} as { mode?: string }));
  if (typeof body.mode === "string" && body.mode !== "direct_fcm") {
    return NextResponse.json(
      {
        error:
          "Only mode=direct_fcm is allowed. DM/conversation-creating self-tests are disabled to avoid polluting My Chats.",
      },
      { status: 400 }
    );
  }

  const result = await sendFcmToUser({
    admin,
    userId: targetUserId,
    notification: null,
    title: "SpotDrop",
    body: "Background push test with sound",
    href: "/dm",
    type: "direct_message",
    apnsSound: PUSH_SOUND,
  });

  return NextResponse.json({
    mode: "direct_fcm",
    targetUserId,
    iosTokenCount: ios.length,
    firebaseProjectId,
    serviceAccountEmail,
    googleAccessTokenOk,
    googleAccessTokenError,
    expectedIosProjectId: "spotdrop-87acb",
    projectIdMatchesIosPlist: firebaseProjectId === "spotdrop-87acb",
    ...result,
  });
}
