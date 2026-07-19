import { NextResponse } from "next/server";
import { getFirebaseAdminMessaging, isFcmConfigured } from "@/lib/firebaseAdmin";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { PUSH_SOUND, sendFcmToUser } from "@/lib/serverPushSend";

/**
 * Temporary Production self-test for iOS push.
 * Auth: header x-spotdrop-selftest must equal PUSH_SELFTEST_KEY.
 * Remove after push pipeline is verified.
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

    // Verify the service account can mint a Google OAuth access token.
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
  const body = await request.json().catch(() => ({} as { mode?: string; senderUserId?: string }));
  const mode = typeof body.mode === "string" ? body.mode : "direct_fcm";

  if (mode === "direct_fcm") {
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
      mode,
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

  // Full DM path: insert message from a different user, then deliver via notification row.
  const senderUserId =
    typeof body.senderUserId === "string" && body.senderUserId
      ? body.senderUserId
      : (tokens ?? []).map((row) => String(row.user_id)).find((id) => id !== targetUserId) ?? null;

  let senderId = senderUserId;
  if (!senderId) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
    senderId = users?.users?.find((user) => user.id !== targetUserId)?.id ?? null;
  }

  if (!senderId) {
    return NextResponse.json({ error: "No alternate sender user found." }, { status: 400 });
  }

  // Ensure profiles exist for FK
  await admin.from("profiles").upsert({ id: senderId, username: `push_sender_${senderId.slice(0, 8)}` });
  await admin.from("profiles").upsert({ id: targetUserId, username: `push_recv_${targetUserId.slice(0, 8)}` });

  const { data: inserted, error: insertError } = await admin
    .from("direct_messages")
    .insert({
      sender_id: senderId,
      recipient_id: targetUserId,
      message_type: "text",
      body: `Live push DM test ${new Date().toISOString()}`,
    })
    .select("id, sender_id, recipient_id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "DM insert failed" }, { status: 500 });
  }

  // Wait for trigger
  await new Promise((resolve) => setTimeout(resolve, 400));

  const { data: notification } = await admin
    .from("notifications")
    .select("id, user_id, type, actor_id, href, source_id, metadata, read_at, created_at")
    .eq("type", "direct_message")
    .eq("source_id", String(inserted.id))
    .maybeSingle();

  if (!notification) {
    return NextResponse.json(
      {
        error: "No notification row created for DM",
        messageId: inserted.id,
        senderId,
        recipientId: targetUserId,
      },
      { status: 500 }
    );
  }

  const { deliverNotificationPush, mapNotificationRow } = await import("@/lib/serverPushSend");
  const mapped = mapNotificationRow(notification);
  const result = await deliverNotificationPush(admin, mapped, { tokenQueryUserId: targetUserId });

  return NextResponse.json({
    mode: "dm_pipeline",
    messageId: inserted.id,
    senderId,
    recipientId: targetUserId,
    notificationId: mapped.id,
    notificationUserId: mapped.user_id,
    ...result,
  });
}
