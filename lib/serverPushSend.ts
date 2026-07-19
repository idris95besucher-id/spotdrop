import type { Messaging } from "firebase-admin/messaging";
import { getFirebaseAdminMessaging, isFcmConfigured } from "@/lib/firebaseAdmin";
import {
  buildNotificationPushPayload,
  type NotificationRow,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  defaultServerNotificationPreferences,
  shouldAllowPushForType,
  type ServerNotificationPreferences,
} from "@/lib/userNotificationPreferences";

export const PUSH_SOUND = "default";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type PushSendResult = {
  sent: number;
  fcmSent: number;
  skipped?: string;
  badge: number;
  staleFcm: number;
  tokenCount: number;
  errors: Array<{ tokenPreview: string; code: string; message: string }>;
  messageIds: string[];
};

function isMissingPushTokensTable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("user_push_tokens") && message.includes("does not exist")) ||
    (message.includes("fcm_device_tokens") && message.includes("does not exist"))
  );
}

export async function loadUserPushTokens(admin: AdminClient, userId: string) {
  const tokens = new Set<string>();

  const { data: primaryRows, error: primaryError } = await admin
    .from("user_push_tokens")
    .select("token, platform")
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

  return {
    tokens: [...tokens],
    platforms: (primaryRows ?? []).map((row) => ({
      tokenPreview: `${String(row.token).slice(0, 12)}…`,
      platform: String(row.platform ?? "unknown"),
    })),
  };
}

export async function countUnreadNotificationsAdmin(admin: AdminClient, userId: string) {
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

export async function loadServerNotificationPreferences(
  admin: AdminClient,
  userId: string
): Promise<ServerNotificationPreferences> {
  const defaults = defaultServerNotificationPreferences();

  const { data, error } = await admin
    .from("user_notification_preferences")
    .select(
      "all_enabled, direct_messages, group_messages, room_messages, likes, comments, new_followers, sound, vibration"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return defaults;
  }

  return {
    all_enabled: Boolean(data.all_enabled),
    direct_messages: Boolean(data.direct_messages),
    group_messages: Boolean(data.group_messages),
    room_messages: Boolean(data.room_messages),
    likes: Boolean(data.likes),
    comments: Boolean(data.comments),
    new_followers: Boolean(data.new_followers),
    sound: Boolean(data.sound),
    vibration: Boolean(data.vibration),
  };
}

/** Returns false if this notification was already pushed (dedupe). */
export async function claimPushSend(admin: AdminClient, notificationId: string) {
  const { data, error } = await admin
    .from("push_send_dedupe")
    .insert({ notification_id: notificationId })
    .select("notification_id")
    .maybeSingle();

  if (error) {
    // Table missing or conflict — treat unique violation as already sent.
    if (error.code === "23505") {
      return false;
    }

    if (error.code === "42P01" || error.code === "PGRST205") {
      return true;
    }

    console.warn("[Push] dedupe claim failed — continuing", error.message);
    return true;
  }

  return Boolean(data?.notification_id);
}

export async function sendFcmToUser(input: {
  admin: AdminClient;
  userId: string;
  notification: NotificationRow | null;
  title: string;
  body: string;
  href: string;
  type: string;
  apnsSound?: string;
}): Promise<PushSendResult> {
  const { admin, userId, notification, title, body, href, type, apnsSound } = input;
  const { count: badgeCount } = await countUnreadNotificationsAdmin(admin, userId);
  const errors: PushSendResult["errors"] = [];
  const messageIds: string[] = [];
  const staleFcmTokens: string[] = [];
  let fcmSent = 0;

  if (!isFcmConfigured()) {
    console.error("[Push] FCM not configured — FIREBASE_SERVICE_ACCOUNT_JSON missing");
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "fcm_not_configured",
      badge: badgeCount,
      staleFcm: 0,
      tokenCount: 0,
      errors: [{ tokenPreview: "", code: "config", message: "FIREBASE_SERVICE_ACCOUNT_JSON missing" }],
      messageIds: [],
    };
  }

  const messaging = getFirebaseAdminMessaging();

  if (!messaging) {
    console.error("[Push] Firebase messaging client unavailable");
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "fcm_client_unavailable",
      badge: badgeCount,
      staleFcm: 0,
      tokenCount: 0,
      errors: [],
      messageIds: [],
    };
  }

  let tokens: string[] = [];
  let platforms: Array<{ tokenPreview: string; platform: string }> = [];

  try {
    const loaded = await loadUserPushTokens(admin, userId);
    tokens = loaded.tokens;
    platforms = loaded.platforms;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load push tokens.";
    console.error("[Push] token load failed", { userId, message });
    throw error;
  }

  console.info("[Push] FCM send start", {
    userId,
    type,
    notificationId: notification?.id ?? null,
    tokenCount: tokens.length,
    platforms,
    sound: apnsSound ?? null,
    badge: badgeCount,
    title,
  });

  if (tokens.length === 0) {
    console.warn("[Push] no tokens in user_push_tokens for recipient", { userId, type });
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "no_tokens",
      badge: badgeCount,
      staleFcm: 0,
      tokenCount: 0,
      errors: [],
      messageIds: [],
    };
  }

  await Promise.all(
    tokens.map(async (token) => {
      const tokenPreview = `${token.slice(0, 12)}…`;

      try {
        const messageId = await sendOneFcm(messaging, {
          token,
          title,
          body,
          href,
          type,
          notificationId: notification?.id ?? "",
          badgeCount,
          apnsSound,
        });

        fcmSent += 1;
        messageIds.push(messageId);
        console.info("[Push] FCM/APNs accepted", { tokenPreview, messageId, type });
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "unknown";
        const message = error instanceof Error ? error.message : String(error);

        console.error("[Push] FCM/APNs rejected", { tokenPreview, code, message, type });
        errors.push({ tokenPreview, code, message });

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
    console.warn("[Push] removed stale FCM tokens", { count: staleFcmTokens.length });
  }

  console.info("[Push] FCM send done", {
    userId,
    type,
    fcmSent,
    tokenCount: tokens.length,
    staleFcm: staleFcmTokens.length,
    errorCount: errors.length,
    messageIds,
  });

  return {
    sent: fcmSent,
    fcmSent,
    badge: badgeCount,
    staleFcm: staleFcmTokens.length,
    tokenCount: tokens.length,
    errors,
    messageIds,
  };
}

async function sendOneFcm(
  messaging: Messaging,
  input: {
    token: string;
    title: string;
    body: string;
    href: string;
    type: string;
    notificationId: string;
    badgeCount: number;
    apnsSound?: string;
  }
) {
  return messaging.send({
    token: input.token,
    notification: {
      title: input.title,
      body: input.body,
    },
    data: {
      href: input.href,
      type: input.type,
      notificationId: input.notificationId,
      title: input.title,
      body: input.body,
    },
    apns: {
      headers: {
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      payload: {
        aps: {
          alert: {
            title: input.title,
            body: input.body,
          },
          ...(input.apnsSound ? { sound: input.apnsSound } : {}),
          badge: input.badgeCount,
        },
      },
    },
    android: {
      priority: "high",
      notification: {
        ...(input.apnsSound ? { sound: input.apnsSound } : {}),
        notificationCount: input.badgeCount,
      },
    },
  });
}

export async function deliverNotificationPush(
  admin: AdminClient,
  notification: NotificationRow
): Promise<PushSendResult> {
  const prefs = await loadServerNotificationPreferences(admin, notification.user_id);

  if (!shouldAllowPushForType(notification.type, prefs)) {
    console.info("[Push] skipped — user prefs disabled", {
      notificationId: notification.id,
      type: notification.type,
      userId: notification.user_id,
    });
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "user_prefs_disabled",
      badge: 0,
      staleFcm: 0,
      tokenCount: 0,
      errors: [],
      messageIds: [],
    };
  }

  const claimed = await claimPushSend(admin, notification.id);

  if (!claimed) {
    console.info("[Push] skipped — already delivered", { notificationId: notification.id });
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "already_sent",
      badge: 0,
      staleFcm: 0,
      tokenCount: 0,
      errors: [],
      messageIds: [],
    };
  }

  const payload = buildNotificationPushPayload(notification);

  return sendFcmToUser({
    admin,
    userId: notification.user_id,
    notification,
    title: payload.title,
    body: payload.body,
    href: notification.href,
    type: notification.type,
    apnsSound: prefs.sound ? PUSH_SOUND : undefined,
  });
}

export function mapNotificationRow(data: {
  id: unknown;
  user_id: unknown;
  type: unknown;
  actor_id?: unknown;
  href: unknown;
  source_id: unknown;
  metadata?: unknown;
  read_at?: unknown;
  created_at: unknown;
}): NotificationRow {
  return {
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
