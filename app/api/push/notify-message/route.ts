import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { deliverNotificationPush, mapNotificationRow } from "@/lib/serverPushSend";
import type { NotificationRow } from "@/lib/notifications";

type NotifyBody = {
  messageId?: string;
  type?: "direct_message" | "group_message" | "room_message" | "room_mention";
};

const PUSH_TYPES = new Set(["direct_message", "group_message", "room_message", "room_mention"]);

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadNotificationsForMessage(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  messageId: string,
  type: string,
  actorId: string
) {
  // Trigger insert is same-transaction as the message; short retry covers replica lag.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let query = admin
      .from("notifications")
      .select("id, user_id, type, actor_id, href, source_id, metadata, read_at, created_at")
      .eq("type", type)
      .eq("actor_id", actorId);

    if (type === "direct_message") {
      query = query.eq("source_id", messageId);
    } else {
      query = query.like("source_id", `${messageId}:%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      return data.map(mapNotificationRow);
    }

    await sleep(150);
  }

  return [] as NotificationRow[];
}

/**
 * Sender-triggered push: fires immediately after a message insert so delivery
 * does not depend on the recipient's app being open or on pg_net GUCs alone.
 */
export async function POST(request: Request) {
  const actorId = await resolveAuthenticatedUserId(request);

  if (!actorId) {
    console.warn("[Push] notify-message unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    console.error("[Push] notify-message — admin client missing");
    return NextResponse.json({ error: "Push temporarily unavailable." }, { status: 503 });
  }

  let body: NotifyBody;

  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messageId = body.messageId?.trim() ?? "";
  const type = body.type?.trim() ?? "";

  if (!messageId || !PUSH_TYPES.has(type)) {
    return NextResponse.json({ error: "messageId and valid type are required." }, { status: 400 });
  }

  console.info("[Push] notify-message start", { actorId, messageId, type });

  let notifications: NotificationRow[];

  try {
    notifications = await loadNotificationsForMessage(admin, messageId, type, actorId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notifications.";
    console.error("[Push] notify-message notification lookup failed", { messageId, type, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (notifications.length === 0) {
    console.warn("[Push] notify-message — no notification rows (muted, trigger missing, or lag)", {
      actorId,
      messageId,
      type,
      chainStage: "message_insert→notifications",
    });
    return NextResponse.json({
      sent: 0,
      fcmSent: 0,
      skipped: "no_notification_rows",
      chainStage: "message_insert→notifications",
    });
  }

  const results = [];

  for (const notification of notifications) {
    try {
      const result = await deliverNotificationPush(admin, notification);
      results.push({
        notificationId: notification.id,
        userId: notification.user_id,
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Push] notify-message deliver failed", {
        notificationId: notification.id,
        message,
      });
      results.push({
        notificationId: notification.id,
        userId: notification.user_id,
        sent: 0,
        fcmSent: 0,
        error: message,
      });
    }
  }

  const fcmSent = results.reduce((sum, row) => sum + (row.fcmSent ?? 0), 0);

  console.info("[Push] notify-message done", {
    messageId,
    type,
    recipients: notifications.length,
    fcmSent,
    chainStage: fcmSent > 0 ? "fcm→apns_accepted" : "fcm_or_tokens_failed",
  });

  return NextResponse.json({
    sent: fcmSent,
    fcmSent,
    recipients: notifications.length,
    results,
    chainStage: fcmSent > 0 ? "fcm→apns_accepted" : "check_results",
  });
}
