import webpush from "web-push";
import { NextResponse } from "next/server";
import { buildNotificationPushPayload, type NotificationRow } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!configureWebPush()) {
    return NextResponse.json(
      { error: "Web Push is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY." },
      { status: 503 }
    );
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
  }

  const targetUserId = notification?.user_id ?? userId;

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", targetUserId);

  if (subscriptionsError) {
    return NextResponse.json({ error: subscriptionsError.message }, { status: 500 });
  }

  if (!subscriptions?.length) {
    return NextResponse.json({ sent: 0, skipped: "no_subscriptions" });
  }

  const payload = notification
    ? buildNotificationPushPayload(notification)
    : { title: "SpotDrop", body: "You have a new notification" };

  const pushBody = JSON.stringify({
    title: payload.title,
    body: payload.body,
    href: notification?.href ?? "/notifications",
  });

  let sent = 0;
  const staleEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
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
        sent += 1;
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

  return NextResponse.json({ sent, stale: staleEndpoints.length });
}
