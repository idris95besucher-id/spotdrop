import webpush from "web-push";
import { NextResponse } from "next/server";
import { isFcmConfigured } from "@/lib/firebaseAdmin";
import {
  buildNotificationPushPayload,
  type NotificationRow,
} from "@/lib/notifications";
import {
  loadNotificationsForMessage,
  MESSAGE_PUSH_TYPES,
  resolveAuthenticatedUserId,
} from "@/lib/pushNotifyMessage";
import { resolveAndLogDmPushRecipient } from "@/lib/pushRecipientResolve";
import { logInvalidMessageId, parseOptionalPushIdField } from "@/lib/pushRequestParse";
import { pushServerError, pushServerLog } from "@/lib/pushServerLog";
import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig,
  getSupabaseAdminMissingEnvMessage,
} from "@/lib/supabaseAdmin";
import {
  deliverNotificationPush,
  loadServerNotificationPreferences,
  mapNotificationRow,
  PUSH_SOUND,
  sendFcmToUser,
  type PushSendResult,
} from "@/lib/serverPushSend";
import { shouldAllowPushForType } from "@/lib/userNotificationPreferences";

type PushSendBody = {
  notificationId?: unknown;
  userId?: unknown;
  messageId?: unknown;
  type?: unknown;
};

function parsePushType(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function emptyFcmResult(skipped?: string): PushSendResult {
  return {
    sent: 0,
    fcmSent: 0,
    skipped,
    badge: 0,
    staleFcm: 0,
    tokenCount: 0,
    successCount: 0,
    failureCount: 0,
    errors: [],
    messageIds: [],
  };
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@spotdrop.app";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function isWebhookAuthorized(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET ?? "";
  const authHeader = request.headers.get("authorization") ?? "";

  if (secret && authHeader === `Bearer ${secret}`) {
    return true;
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return Boolean(serviceRole && authHeader === `Bearer ${serviceRole}`);
}

function shouldSendPushForType(type: NotificationRow["type"]) {
  return (
    type === "direct_message" ||
    type === "message_request" ||
    type === "room_message" ||
    type === "room_mention" ||
    type === "group_message" ||
    type === "new_follower" ||
    type === "post_comment"
  );
}

async function handleSenderMessagePush(
  request: Request,
  messageId: string,
  type: string,
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>
) {
  const actorId = await resolveAuthenticatedUserId(request);

  if (!actorId) {
    pushServerError("1", "sender JWT unauthorized for messageId path");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  pushServerLog("1", "DM/message creation → /api/push/send (sender JWT)", {
    actorId,
    messageId,
    type,
  });

  if (!MESSAGE_PUSH_TYPES.has(type)) {
    pushServerError("1", "valid type required", { messageId, type });
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
    let tokenQueryUserId = notification.user_id;
    let recipientResolution: Awaited<ReturnType<typeof resolveAndLogDmPushRecipient>> | null = null;

    if (type === "direct_message") {
      recipientResolution = await resolveAndLogDmPushRecipient({
        admin,
        messageId,
        senderUserId: actorId,
        notification,
      });
      tokenQueryUserId = recipientResolution.tokenQueryUserId;
    }

    pushServerLog("2", "Entering deliverNotificationPush from /api/push/send", {
      notificationId: notification.id,
      notificationUserId: notification.user_id,
      tokenQueryUserId,
      type: notification.type,
    });
    pushServerLog("3", "Recipient user_id for token query", {
      sender_user_id: recipientResolution?.senderUserId ?? actorId,
      recipient_user_id: recipientResolution?.recipientUserId ?? notification.user_id,
      messageId,
      conversation_participants: recipientResolution?.conversationParticipants ?? null,
      token_query_user_id: tokenQueryUserId,
      token_query_matches_iphone_token_owner:
        recipientResolution?.tokenQueryMatchesIphoneTokenOwner ?? null,
    });

    try {
      const result = await deliverNotificationPush(admin, notification, { tokenQueryUserId });
      results.push({
        notificationId: notification.id,
        userId: tokenQueryUserId,
        notificationUserId: notification.user_id,
        recipientResolution,
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushServerError("7", "deliverNotificationPush threw", {
        notificationId: notification.id,
        tokenQueryUserId,
        recipientUserId: notification.user_id,
        message,
      });
      results.push({
        notificationId: notification.id,
        userId: tokenQueryUserId,
        notificationUserId: notification.user_id,
        sent: 0,
        fcmSent: 0,
        successCount: 0,
        failureCount: 0,
        error: message,
      });
    }
  }

  const fcmSent = results.reduce((sum, row) => sum + (row.fcmSent ?? 0), 0);
  const successCount = results.reduce((sum, row) => sum + (("successCount" in row && typeof row.successCount === "number") ? row.successCount : 0), 0);
  const failureCount = results.reduce((sum, row) => sum + (("failureCount" in row && typeof row.failureCount === "number") ? row.failureCount : 0), 0);
  const chainStage =
    fcmSent > 0
      ? "fcm→apns_accepted"
      : results.some((row) => "skipped" in row && row.skipped === "no_tokens")
        ? "fcm→no_tokens"
        : results.some((row) => "errors" in row && Array.isArray(row.errors) && row.errors.length > 0)
          ? "fcm→apns_rejected"
          : "check_results";

  pushServerLog("7", "/api/push/send DONE (sender message path)", {
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

export async function POST(request: Request) {
  pushServerLog("2", "Entering /api/push/send", {
    hasAuthHeader: Boolean(request.headers.get("authorization")),
    fcmConfigured: isFcmConfigured(),
  });

  const adminConfig = getSupabaseAdminConfig();
  const admin = createSupabaseAdminClient();

  if (!admin) {
    const message = getSupabaseAdminMissingEnvMessage(adminConfig) ?? "Supabase admin client is not configured.";
    pushServerError("2", "Supabase admin client not configured", {
      missing: adminConfig.missing,
      hasUrl: adminConfig.hasUrl,
      hasServiceRoleKey: adminConfig.hasServiceRoleKey,
    });
    return NextResponse.json(
      {
        error: message,
        missing: adminConfig.missing,
      },
      { status: 503 }
    );
  }

  let body: PushSendBody;

  try {
    body = (await request.json()) as PushSendBody;
  } catch {
    pushServerError("2", "Invalid JSON body");
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawMessageId = body.messageId;
  const messageIdParse = parseOptionalPushIdField(rawMessageId, "messageId");

  pushServerLog("2", "/api/push/send body", {
    typeofMessageId: rawMessageId === null ? "null" : Array.isArray(rawMessageId) ? "array" : typeof rawMessageId,
    messageIdPreview:
      typeof rawMessageId === "string" || typeof rawMessageId === "number"
        ? String(rawMessageId).slice(0, 64)
        : rawMessageId == null
          ? null
          : Array.isArray(rawMessageId)
            ? `Array(len=${rawMessageId.length})`
            : typeof rawMessageId,
    typeofNotificationId: typeof body.notificationId,
    typeofUserId: typeof body.userId,
    type: typeof body.type === "string" ? body.type : body.type == null ? null : typeof body.type,
  });

  // Sender-triggered path (user JWT + messageId). Deployed on the same route as
  // the webhook so production does not depend on a separate notify-message deploy.
  if ("ok" in messageIdParse) {
    if (!messageIdParse.ok) {
      logInvalidMessageId(rawMessageId, messageIdParse);
      return NextResponse.json(
        {
          error: "Invalid messageId.",
          reason: messageIdParse.reason,
          typeofMessageId: messageIdParse.typeofValue,
        },
        { status: 400 }
      );
    }

    const type = parsePushType(body.type);
    return handleSenderMessagePush(request, messageIdParse.value, type, admin);
  }

  if (!isWebhookAuthorized(request)) {
    pushServerError("2", "/api/push/send unauthorized (webhook/service role required)");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const notificationIdParse = parseOptionalPushIdField(body.notificationId, "notificationId");
  const userIdParse = parseOptionalPushIdField(body.userId, "userId");

  if ("ok" in notificationIdParse && !notificationIdParse.ok) {
    pushServerError("2", "invalid notificationId", {
      typeofNotificationId: notificationIdParse.typeofValue,
      preview: notificationIdParse.preview,
      reason: notificationIdParse.reason,
    });
    return NextResponse.json({ error: "Invalid notificationId." }, { status: 400 });
  }

  if ("ok" in userIdParse && !userIdParse.ok) {
    pushServerError("2", "invalid userId", {
      typeofUserId: userIdParse.typeofValue,
      preview: userIdParse.preview,
      reason: userIdParse.reason,
    });
    return NextResponse.json({ error: "Invalid userId." }, { status: 400 });
  }

  const notificationId = "ok" in notificationIdParse && notificationIdParse.ok ? notificationIdParse.value : "";
  const userId = "ok" in userIdParse && userIdParse.ok ? userIdParse.value : "";

  if (!notificationId && !userId) {
    pushServerError("2", "notificationId or userId required");
    return NextResponse.json({ error: "notificationId or userId is required." }, { status: 400 });
  }

  let notification: NotificationRow | null = null;

  if (notificationId) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, user_id, type, actor_id, href, source_id, metadata, read_at, created_at")
      .eq("id", notificationId)
      .maybeSingle();

    if (error) {
      pushServerError("2", "notification load failed", { notificationId, error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      pushServerError("2", "notification not found", { notificationId });
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    notification = mapNotificationRow(data);
    pushServerLog("3", "Notification loaded", {
      notificationId: notification.id,
      recipientUserId: notification.user_id,
      type: notification.type,
      actorId: notification.actor_id,
      href: notification.href,
      sourceId: notification.source_id,
    });

    if (!shouldSendPushForType(notification.type)) {
      pushServerLog("2", "skipped type_not_push_enabled", { type: notification.type });
      return NextResponse.json({ sent: 0, skipped: "type_not_push_enabled" });
    }
  }

  const targetUserId = notification?.user_id ?? userId;
  pushServerLog("3", "Recipient user_id", { recipientUserId: targetUserId });

  const userPrefs = await loadServerNotificationPreferences(admin, targetUserId);

  if (notification && !shouldAllowPushForType(notification.type, userPrefs)) {
    pushServerError("prefs", "user_prefs_disabled", {
      notificationId,
      recipientUserId: targetUserId,
      prefs: userPrefs,
    });
    return NextResponse.json({ sent: 0, skipped: "user_prefs_disabled" });
  }

  let recipientLanguage: string | null = null;

  if (notification?.type === "message_request" && targetUserId) {
    const { data: languageRow } = await admin
      .from("profiles")
      .select("language")
      .eq("id", targetUserId)
      .maybeSingle();
    recipientLanguage =
      typeof (languageRow as { language?: unknown } | null)?.language === "string"
        ? String((languageRow as { language: string }).language)
        : null;
  }

  const payload = notification
    ? buildNotificationPushPayload(notification, recipientLanguage)
    : { title: "SpotDrop", body: "You have a new notification" };

  const href = notification?.href ?? "/notifications";
  const type = notification?.type ?? "direct_message";
  const apnsSound = userPrefs.sound ? PUSH_SOUND : undefined;

  const webConfigured = configureWebPush();
  let webSent = 0;
  const staleEndpoints: string[] = [];

  if (webConfigured) {
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", targetUserId);

    if (subscriptionsError) {
      return NextResponse.json({ error: subscriptionsError.message }, { status: 500 });
    }

    const pushBody = JSON.stringify({
      title: payload.title,
      body: payload.body,
      href,
      type,
    });

    await Promise.all(
      (subscriptions ?? []).map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            pushBody
          );
          webSent += 1;
        } catch (error) {
          const statusCode =
            error && typeof error === "object" && "statusCode" in error
              ? Number((error as { statusCode?: number }).statusCode)
              : null;

          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(subscription.endpoint);
          }
        }
      })
    );

    if (staleEndpoints.length) {
      await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }
  }

  let fcmResult = emptyFcmResult();

  if (notification) {
    fcmResult = await deliverNotificationPush(admin, notification);
  } else if (isFcmConfigured()) {
    fcmResult = await sendFcmToUser({
      admin,
      userId: targetUserId,
      notification: null,
      title: payload.title,
      body: payload.body,
      href,
      type,
      apnsSound,
    });
  } else {
    pushServerError("fcm-init", "No notification row and FCM not configured");
  }

  const sent = webSent + fcmResult.fcmSent;

  if (sent === 0 && !webConfigured && !isFcmConfigured()) {
    pushServerError("fcm-init", "Push not configured — missing VAPID and FIREBASE_SERVICE_ACCOUNT_JSON");
    return NextResponse.json(
      { error: "Push is not configured. Set VAPID keys and/or FIREBASE_SERVICE_ACCOUNT_JSON." },
      { status: 503 }
    );
  }

  const chainStage =
    fcmResult.skipped === "no_tokens"
      ? "fcm→no_tokens"
      : fcmResult.skipped === "fcm_not_configured" || fcmResult.skipped === "fcm_client_unavailable"
        ? "fcm→init_failed"
        : fcmResult.fcmSent > 0
          ? "fcm→apns_accepted"
          : fcmResult.errors.length
            ? "fcm→apns_rejected"
            : fcmResult.skipped ?? "webhook→fcm";

  pushServerLog("7", "/api/push/send DONE", {
    notificationId: notification?.id ?? null,
    recipientUserId: targetUserId,
    webSent,
    fcmSent: fcmResult.fcmSent,
    successCount: fcmResult.successCount,
    failureCount: fcmResult.failureCount,
    tokenCount: fcmResult.tokenCount,
    skipped: fcmResult.skipped ?? null,
    errors: fcmResult.errors,
    messageIds: fcmResult.messageIds,
    staleFcm: fcmResult.staleFcm,
    chainStage,
  });

  return NextResponse.json({
    sent,
    webSent,
    fcmSent: fcmResult.fcmSent,
    successCount: fcmResult.successCount,
    failureCount: fcmResult.failureCount,
    badge: fcmResult.badge,
    staleWeb: staleEndpoints.length,
    staleFcm: fcmResult.staleFcm,
    tokenCount: fcmResult.tokenCount,
    skipped: fcmResult.skipped,
    errors: fcmResult.errors,
    messageIds: fcmResult.messageIds,
    chainStage,
  });
}
