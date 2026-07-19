import webpush from "web-push";
import { NextResponse } from "next/server";
import { isFcmConfigured } from "@/lib/firebaseAdmin";
import {
  buildNotificationPushPayload,
  type NotificationRow,
} from "@/lib/notifications";
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
  if (!isAuthorized(request)) {
    console.warn("[Push] /api/push/send unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    console.error("[Push] /api/push/send — Supabase admin not configured");
    return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 503 });
  }

  let body: PushSendBody;

  try {
    body = (await request.json()) as PushSendBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const notificationId = body.notificationId?.trim() ?? "";
  const userId = body.userId?.trim() ?? "";

  if (!notificationId && !userId) {
    return NextResponse.json({ error: "notificationId or userId is required." }, { status: 400 });
  }

  console.info("[Push] webhook received", {
    notificationId: notificationId || null,
    userId: userId || null,
    fcmConfigured: isFcmConfigured(),
  });

  let notification: NotificationRow | null = null;

  if (notificationId) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, user_id, type, actor_id, href, source_id, metadata, read_at, created_at")
      .eq("id", notificationId)
      .maybeSingle();

    if (error) {
      console.error("[Push] notification load failed", { notificationId, error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      console.warn("[Push] notification not found", { notificationId, chainStage: "webhook→notification" });
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    notification = mapNotificationRow(data);

    if (!shouldSendPushForType(notification.type)) {
      console.info("[Push] skipped type", { type: notification.type, notificationId });
      return NextResponse.json({ sent: 0, skipped: "type_not_push_enabled" });
    }
  }

  const targetUserId = notification?.user_id ?? userId;
  const userPrefs = await loadServerNotificationPreferences(admin, targetUserId);

  if (notification && !shouldAllowPushForType(notification.type, userPrefs)) {
    console.info("[Push] skipped prefs", { notificationId, userId: targetUserId });
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
  }

  const sent = webSent + fcmResult.fcmSent;

  if (sent === 0 && !webConfigured && !isFcmConfigured()) {
    console.error("[Push] not configured — missing VAPID and FIREBASE_SERVICE_ACCOUNT_JSON");
    return NextResponse.json(
      { error: "Push is not configured. Set VAPID keys and/or FIREBASE_SERVICE_ACCOUNT_JSON." },
      { status: 503 }
    );
  }

  const chainStage =
    fcmResult.skipped === "no_tokens"
      ? "fcm→no_tokens"
      : fcmResult.fcmSent > 0
        ? "fcm→apns_accepted"
        : fcmResult.errors.length
          ? "fcm→apns_rejected"
          : fcmResult.skipped ?? "webhook→fcm";

  console.info("[Push] webhook done", {
    notificationId: notification?.id ?? null,
    userId: targetUserId,
    webSent,
    fcmSent: fcmResult.fcmSent,
    tokenCount: fcmResult.tokenCount,
    skipped: fcmResult.skipped ?? null,
    errors: fcmResult.errors,
    messageIds: fcmResult.messageIds,
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
