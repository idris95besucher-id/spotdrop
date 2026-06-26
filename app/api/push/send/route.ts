import webpush from "web-push";
import { NextResponse } from "next/server";
import { getFirebaseAdminMessaging, isFcmConfigured } from "@/lib/firebaseAdmin";
import {
  buildNotificationPushPayload,
  countUnreadNotifications,
  type NotificationRow,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type PushSendBody = {
  notificationId?: string;
  userId?: string;
};

const PUSH_SOUND = "default";

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
    type === "new_follower"
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
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

  let notification: NotificationRow | null = null;

  if (notificationId) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, user_id, type, actor_id, href, source_id, metadata, read_at, created_at")
      .eq("id", notificationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    notification = {
      id: String(data.id),
      user_id: String(data.user_id),
      type: data.type as NotificationRow["type"],
      actor_id: data.actor_id ? String(data.actor_id) : null,
      href: String(data.href),
      source_id: String(data.source_id),
      metadata: (data.metadata as Record<string, unknown> | null) ?? {},
      read_at: (data.read_at as string | null) ?? null,
      created_at: String(data.created_at),
    };

    if (!shouldSendPushForType(notification.type)) {
      return NextResponse.json({ sent: 0, skipped: "type_not_push_enabled" });
    }
  }

  const targetUserId = notification?.user_id ?? userId;

  const { count: badgeCount } = await countUnreadNotificationsAdmin(admin, targetUserId);

  const payload = notification
    ? buildNotificationPushPayload(notification)
    : { title: "SpotDrop", body: "You have a new notification" };

  const href = notification?.href ?? "/notifications";
  const type = notification?.type ?? "direct_message";

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
      badge: badgeCount,
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

  let fcmSent = 0;
  const staleFcmTokens: string[] = [];

  const messaging = getFirebaseAdminMessaging();

  if (messaging && isFcmConfigured()) {
    let pushTokens: string[] = [];

    try {
      pushTokens = await loadUserPushTokens(admin, targetUserId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load push tokens.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await Promise.all(
      pushTokens.map(async (token) => {

        try {
          await messaging.send({
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              href,
              type,
              notificationId: notification?.id ?? "",
            },
            apns: {
              payload: {
                aps: {
                  sound: PUSH_SOUND,
                  badge: badgeCount,
                  "mutable-content": 1,
                },
              },
            },
            android: {
              notification: {
                sound: PUSH_SOUND,
                notificationCount: badgeCount,
              },
            },
          });

          fcmSent += 1;
        } catch (error) {
          const code =
            error && typeof error === "object" && "code" in error
              ? String((error as { code?: string }).code)
              : "";

          if (
            code.includes("registration-token-not-registered") ||
            code.includes("invalid-registration-token")
          ) {
            staleFcmTokens.push(token);
          }
        }
      })
    );

    if (staleFcmTokens.length) {
      await admin.from("user_push_tokens").delete().in("token", staleFcmTokens);
      await admin.from("fcm_device_tokens").delete().in("fcm_token", staleFcmTokens);
    }
  }

  const sent = webSent + fcmSent;

  if (sent === 0 && !webConfigured && !isFcmConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured. Set VAPID keys and/or FIREBASE_SERVICE_ACCOUNT_JSON." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    sent,
    webSent,
    fcmSent,
    badge: badgeCount,
    staleWeb: staleEndpoints.length,
    staleFcm: staleFcmTokens.length,
  });
}

function isMissingPushTokensTable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("user_push_tokens") && message.includes("does not exist")) ||
    (message.includes("fcm_device_tokens") && message.includes("does not exist"))
  );
}

async function loadUserPushTokens(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string
) {
  const tokens = new Set<string>();

  const { data: primaryRows, error: primaryError } = await admin
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", userId);

  if (primaryError && !isMissingPushTokensTable(primaryError)) {
    throw new Error(primaryError.message);
  }

  for (const row of primaryRows ?? []) {
    tokens.add(String(row.token));
  }

  const { data: legacyRows, error: legacyError } = await admin
    .from("fcm_device_tokens")
    .select("fcm_token")
    .eq("user_id", userId);

  if (legacyError && !isMissingPushTokensTable(legacyError)) {
    throw new Error(legacyError.message);
  }

  for (const row of legacyRows ?? []) {
    tokens.add(String(row.fcm_token));
  }

  return [...tokens];
}

async function countUnreadNotificationsAdmin(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string
) {
  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count ?? 0, error: null as string | null };
}
