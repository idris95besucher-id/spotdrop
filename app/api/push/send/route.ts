import webpush from "web-push";
import { NextResponse } from "next/server";
import { isFcmConfigured } from "@/lib/firebaseAdmin";
import {
  buildNotificationPushPayload,
  type NotificationRow,
} from "@/lib/notifications";
import { pushServerError, pushServerLog } from "@/lib/pushServerLog";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  deliverNotificationPush,
  loadServerNotificationPreferences,
  mapNotificationRow,
  PUSH_SOUND,
  sendFcmToUser,
} from "@/lib/serverPushSend";
import { shouldAllowPushForType } from "@/lib/userNotificationPreferences";

type PushSendBody = {
  notificationId?: string;
  userId?: string;
};

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

function isAuthorized(request: Request) {
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
    type === "room_message" ||
    type === "room_mention" ||
    type === "group_message" ||
    type === "new_follower"
  );
}

export async function POST(request: Request) {
  pushServerLog("2", "/api/push/send CALLED", {
    hasAuthHeader: Boolean(request.headers.get("authorization")),
    fcmConfigured: isFcmConfigured(),
  });

  if (!isAuthorized(request)) {
    pushServerError("2", "/api/push/send unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    pushServerError("2", "Supabase admin client not configured");
    return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 503 });
  }

  let body: PushSendBody;

  try {
    body = (await request.json()) as PushSendBody;
  } catch {
    pushServerError("2", "Invalid JSON body");
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const notificationId = body.notificationId?.trim() ?? "";
  const userId = body.userId?.trim() ?? "";

  pushServerLog("2", "/api/push/send body", {
    notificationId: notificationId || null,
    userId: userId || null,
  });

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

  const payload = notification
    ? buildNotificationPushPayload(notification)
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

  let fcmResult: Awaited<ReturnType<typeof deliverNotificationPush>> = {
    sent: 0,
    fcmSent: 0,
    badge: 0,
    staleFcm: 0,
    tokenCount: 0,
    errors: [],
    messageIds: [],
  };

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
