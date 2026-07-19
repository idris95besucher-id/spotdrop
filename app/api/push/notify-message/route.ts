import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { deliverNotificationPush, mapNotificationRow } from "@/lib/serverPushSend";
import type { NotificationRow } from "@/lib/notifications";
import { pushServerError, pushServerLog } from "@/lib/pushServerLog";

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
      pushServerLog("1", "Notification rows found for message", {
        messageId,
        type,
        attempt: attempt + 1,
        count: data.length,
        recipientUserIds: data.map((row) => row.user_id),
      });
      return data.map(mapNotificationRow);
    }

    pushServerLog("1", "Notification rows not ready yet — retry", {
      messageId,
      type,
      attempt: attempt + 1,
    });
    await sleep(150);
  }

  return [] as NotificationRow[];
}

/**
 * Sender-triggered push: fires immediately after a message insert so delivery
 * does not depend on the recipient's app being open or on pg_net GUCs alone.
 */
export async function POST(request: Request) {
  pushServerLog("1", "/api/push/notify-message CALLED (sender-triggered after DM/message insert)");

  const actorId = await resolveAuthenticatedUserId(request);

  if (!actorId) {
    pushServerError("1", "notify-message unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    pushServerError("1", "admin client missing");
    return NextResponse.json({ error: "Push temporarily unavailable." }, { status: 503 });
  }

  let body: NotifyBody;

  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    pushServerError("1", "Invalid JSON body");
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messageId = body.messageId?.trim() ?? "";
  const type = body.type?.trim() ?? "";

  pushServerLog("1", "DM/message creation → notify-message", {
    actorId,
    messageId,
    type,
  });

  if (!messageId || !PUSH_TYPES.has(type)) {
    pushServerError("1", "messageId and valid type required", { messageId, type });
    return NextResponse.json({ error: "messageId and valid type are required." }, { status: 400 });
  }

  let notifications: NotificationRow[];

  try {
    notifications = await loadNotificationsForMessage(admin, messageId, type, actorId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notifications.";
    pushServerError("1", "notification lookup failed", { messageId, type, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (notifications.length === 0) {
    pushServerError("1", "No notification rows (muted, trigger missing, or lag)", {
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
    pushServerLog("3", "Delivering to recipient", {
      notificationId: notification.id,
      recipientUserId: notification.user_id,
      type: notification.type,
    });

    try {
      const result = await deliverNotificationPush(admin, notification);
      results.push({
        notificationId: notification.id,
        userId: notification.user_id,
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushServerError("7", "deliverNotificationPush threw", {
        notificationId: notification.id,
        recipientUserId: notification.user_id,
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
  const chainStage =
    fcmSent > 0
      ? "fcm→apns_accepted"
      : results.some((row) => "skipped" in row && row.skipped === "no_tokens")
        ? "fcm→no_tokens"
        : results.some((row) => "errors" in row && Array.isArray(row.errors) && row.errors.length > 0)
          ? "fcm→apns_rejected"
          : "check_results";

  pushServerLog("7", "notify-message DONE", {
    messageId,
    type,
    recipients: notifications.length,
    recipientUserIds: notifications.map((n) => n.user_id),
    fcmSent,
    results,
    chainStage,
  });

  return NextResponse.json({
    sent: fcmSent,
    fcmSent,
    recipients: notifications.length,
    results,
    chainStage,
  });
}
