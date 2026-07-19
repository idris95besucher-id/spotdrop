import { NextResponse } from "next/server";
import {
  loadNotificationsForMessage,
  MESSAGE_PUSH_TYPES,
  resolveAuthenticatedUserId,
} from "@/lib/pushNotifyMessage";
import { pushServerError, pushServerLog } from "@/lib/pushServerLog";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { deliverNotificationPush } from "@/lib/serverPushSend";
import type { NotificationRow } from "@/lib/notifications";

type NotifyBody = {
  messageId?: string;
  type?: "direct_message" | "group_message" | "room_message" | "room_mention";
};

/**
 * Sender-triggered push (legacy path). Prefer POST /api/push/send with
 * { messageId, type } + user JWT — that route is what production already hosts.
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

  if (!messageId || !MESSAGE_PUSH_TYPES.has(type)) {
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
    pushServerLog("2", "Entering deliverNotificationPush from /api/push/notify-message", {
      notificationId: notification.id,
      recipientUserId: notification.user_id,
      type: notification.type,
    });
    pushServerLog("3", "Recipient user_id", { recipientUserId: notification.user_id });

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
        successCount: 0,
        failureCount: 0,
        error: message,
      });
    }
  }

  const fcmSent = results.reduce((sum, row) => sum + (row.fcmSent ?? 0), 0);
  const successCount = results.reduce(
    (sum, row) => sum + ("successCount" in row && typeof row.successCount === "number" ? row.successCount : 0),
    0
  );
  const failureCount = results.reduce(
    (sum, row) => sum + ("failureCount" in row && typeof row.failureCount === "number" ? row.failureCount : 0),
    0
  );
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
    successCount,
    failureCount,
    results,
    chainStage,
  });

  return NextResponse.json({
    sent: fcmSent,
    fcmSent,
    successCount,
    failureCount,
    recipients: notifications.length,
    results,
    chainStage,
  });
}
