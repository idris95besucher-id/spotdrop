import { getFirebaseAdminInitError, getFirebaseAdminMessaging, isFcmConfigured } from "@/lib/firebaseAdmin";
import {
  buildNotificationPushPayload,
  type NotificationRow,
} from "@/lib/notifications";
import {
  formatFcmError,
  pushServerError,
  pushServerLog,
  tokenPreview,
} from "@/lib/pushServerLog";
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
  successCount: number;
  failureCount: number;
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
  pushServerLog("4", "Loading tokens from public.user_push_tokens", { recipientUserId: userId });

  const tokens = new Set<string>();

  const { data: primaryRows, error: primaryError } = await admin
    .from("user_push_tokens")
    .select("token, platform, device_id, updated_at")
    .eq("user_id", userId);

  if (primaryError && !isMissingPushTokensTable(primaryError)) {
    pushServerError("4", "user_push_tokens query failed", {
      recipientUserId: userId,
      code: primaryError.code,
      message: primaryError.message,
    });
    throw new Error(primaryError.message);
  }

  if (primaryError && isMissingPushTokensTable(primaryError)) {
    pushServerError("4", "user_push_tokens table missing", {
      code: primaryError.code,
      message: primaryError.message,
    });
  }

  for (const row of primaryRows ?? []) {
    tokens.add(String(row.token));
  }

  pushServerLog("4", "user_push_tokens rows", {
    recipientUserId: userId,
    rowCount: primaryRows?.length ?? 0,
    rows: (primaryRows ?? []).map((row) => ({
      tokenPreview: tokenPreview(String(row.token)),
      platform: row.platform,
      deviceId: row.device_id,
      updatedAt: row.updated_at,
    })),
  });

  const { data: legacyRows, error: legacyError } = await admin
    .from("fcm_device_tokens")
    .select("fcm_token")
    .eq("user_id", userId);

  if (legacyError && !isMissingPushTokensTable(legacyError)) {
    pushServerError("4", "fcm_device_tokens query failed", {
      message: legacyError.message,
    });
    throw new Error(legacyError.message);
  }

  for (const row of legacyRows ?? []) {
    tokens.add(String(row.fcm_token));
  }

  if ((legacyRows?.length ?? 0) > 0) {
    pushServerLog("4", "Also loaded legacy fcm_device_tokens", {
      legacyCount: legacyRows?.length ?? 0,
    });
  }

  return {
    tokens: [...tokens],
    platforms: (primaryRows ?? []).map((row) => ({
      tokenPreview: tokenPreview(String(row.token)) ?? "",
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
    pushServerLog("prefs", "Using default notification prefs", {
      userId,
      error: error?.message ?? null,
      hasRow: Boolean(data),
    });
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
    if (error.code === "23505") {
      pushServerLog("dedupe", "Already claimed — skip duplicate send", { notificationId });
      return false;
    }

    if (error.code === "42P01" || error.code === "PGRST205") {
      pushServerLog("dedupe", "push_send_dedupe table missing — continuing without dedupe");
      return true;
    }

    pushServerError("dedupe", "claim failed — continuing", { message: error.message, notificationId });
    return true;
  }

  pushServerLog("dedupe", "Claimed notification for send", {
    notificationId,
    claimed: Boolean(data?.notification_id),
  });
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

  pushServerLog("3", "sendFcmToUser start", {
    recipientUserId: userId,
    type,
    notificationId: notification?.id ?? null,
    title,
    bodyPreview: body.slice(0, 80),
    href,
    apnsSound: apnsSound ?? null,
    badgeCount,
    fcmConfigured: isFcmConfigured(),
    initError: getFirebaseAdminInitError(),
  });

  if (!isFcmConfigured()) {
    pushServerError("fcm-init", "FIREBASE_SERVICE_ACCOUNT_JSON not configured");
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "fcm_not_configured",
      badge: badgeCount,
      staleFcm: 0,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      errors: [{ tokenPreview: "", code: "config", message: "FIREBASE_SERVICE_ACCOUNT_JSON missing" }],
      messageIds: [],
    };
  }

  const messaging = getFirebaseAdminMessaging();

  if (!messaging) {
    pushServerError("fcm-init", "Firebase Admin messaging client unavailable", {
      initError: getFirebaseAdminInitError(),
    });
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "fcm_client_unavailable",
      badge: badgeCount,
      staleFcm: 0,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      errors: [
        {
          tokenPreview: "",
          code: "fcm_client_unavailable",
          message: getFirebaseAdminInitError() ?? "getMessaging() returned null",
        },
      ],
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
    pushServerError("4", "Token load threw", { recipientUserId: userId, message });
    throw error;
  }

  pushServerLog("4", "Tokens ready for FCM", {
    recipientUserId: userId,
    tokenCount: tokens.length,
    platforms,
  });

  if (tokens.length === 0) {
    pushServerError("4", "No recipient tokens found — cannot send", {
      recipientUserId: userId,
      type,
      notificationId: notification?.id ?? null,
    });
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "no_tokens",
      badge: badgeCount,
      staleFcm: 0,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
      messageIds: [],
    };
  }

  const multicastMessage = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      href,
      type,
      notificationId: notification?.id ?? "",
      title,
      body,
    },
    apns: {
      headers: {
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      payload: {
        aps: {
          alert: {
            title,
            body,
          },
          ...(apnsSound ? { sound: apnsSound } : {}),
          badge: badgeCount,
        },
      },
    },
    android: {
      priority: "high" as const,
      notification: {
        ...(apnsSound ? { sound: apnsSound } : {}),
        notificationCount: badgeCount,
      },
    },
  };

  pushServerLog("5", "Firebase Admin sendEachForMulticast REQUEST", {
    recipientUserId: userId,
    tokenCount: tokens.length,
    tokenPreviews: tokens.map((t) => tokenPreview(t)),
    notification: multicastMessage.notification,
    data: multicastMessage.data,
    apns: multicastMessage.apns,
    android: {
      priority: multicastMessage.android.priority,
      notification: multicastMessage.android.notification,
    },
  });

  const batchResponse = await messaging.sendEachForMulticast(multicastMessage);

  pushServerLog("6", "Firebase Admin sendEachForMulticast RESPONSE", {
    recipientUserId: userId,
    successCount: batchResponse.successCount,
    failureCount: batchResponse.failureCount,
    responses: batchResponse.responses.map((response, index) => {
      if (response.success) {
        return {
          index,
          success: true,
          messageId: response.messageId ?? null,
          tokenPreview: tokenPreview(tokens[index]),
        };
      }

      const formatted = formatFcmError(response.error);
      return {
        index,
        success: false,
        tokenPreview: tokenPreview(tokens[index]),
        code: formatted.code,
        message: formatted.message,
        errorInfoCode: formatted.errorInfoCode,
        errorInfoMessage: formatted.errorInfoMessage,
      };
    }),
  });

  batchResponse.responses.forEach((response, index) => {
    const preview = tokenPreview(tokens[index]) ?? "";

    if (response.success) {
      fcmSent += 1;
      if (response.messageId) {
        messageIds.push(response.messageId);
      }
      return;
    }

    const formatted = formatFcmError(response.error);
    pushServerError("6", "Per-token FCM/APNs error", {
      index,
      tokenPreview: preview,
      ...formatted,
    });
    errors.push({
      tokenPreview: preview,
      code: formatted.code,
      message: formatted.message,
    });

    const code = formatted.code.toLowerCase();
    if (
      code.includes("registration-token-not-registered") ||
      code.includes("invalid-registration-token") ||
      code.includes("messaging/registration-token-not-registered") ||
      code.includes("messaging/invalid-registration-token")
    ) {
      staleFcmTokens.push(tokens[index]);
      pushServerLog("8", "Marked token stale for deletion", {
        tokenPreview: preview,
        code: formatted.code,
      });
    }
  });

  if (staleFcmTokens.length) {
    pushServerLog("8", "Deleting invalid tokens from Supabase", {
      count: staleFcmTokens.length,
      previews: staleFcmTokens.map((t) => tokenPreview(t)),
    });

    const { error: delPrimary } = await admin
      .from("user_push_tokens")
      .delete()
      .in("token", staleFcmTokens);
    const { error: delLegacy } = await admin
      .from("fcm_device_tokens")
      .delete()
      .in("fcm_token", staleFcmTokens);

    if (delPrimary) {
      pushServerError("8", "Failed deleting stale user_push_tokens", { message: delPrimary.message });
    }
    if (delLegacy && !isMissingPushTokensTable(delLegacy)) {
      pushServerError("8", "Failed deleting stale fcm_device_tokens", { message: delLegacy.message });
    }
    if (!delPrimary) {
      pushServerLog("8", "Stale tokens deleted from user_push_tokens", {
        count: staleFcmTokens.length,
      });
    }
  } else {
    pushServerLog("8", "No invalid tokens to delete");
  }

  pushServerLog("7", "FCM send batch complete", {
    recipientUserId: userId,
    type,
    successCount: batchResponse.successCount,
    failureCount: batchResponse.failureCount,
    fcmSent,
    tokenCount: tokens.length,
    staleFcm: staleFcmTokens.length,
    errorCount: errors.length,
    messageIds,
    errors,
  });

  return {
    sent: fcmSent,
    fcmSent,
    badge: badgeCount,
    staleFcm: staleFcmTokens.length,
    tokenCount: tokens.length,
    successCount: batchResponse.successCount,
    failureCount: batchResponse.failureCount,
    errors,
    messageIds,
  };
}

export async function deliverNotificationPush(
  admin: AdminClient,
  notification: NotificationRow
): Promise<PushSendResult> {
  pushServerLog("2", "deliverNotificationPush", {
    notificationId: notification.id,
    recipientUserId: notification.user_id,
    type: notification.type,
    actorId: notification.actor_id,
    href: notification.href,
    sourceId: notification.source_id,
  });

  const prefs = await loadServerNotificationPreferences(admin, notification.user_id);

  if (!shouldAllowPushForType(notification.type, prefs)) {
    pushServerError("prefs", "User prefs disabled push for type", {
      notificationId: notification.id,
      type: notification.type,
      recipientUserId: notification.user_id,
      prefs,
    });
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "user_prefs_disabled",
      badge: 0,
      staleFcm: 0,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
      messageIds: [],
    };
  }

  const claimed = await claimPushSend(admin, notification.id);

  if (!claimed) {
    pushServerLog("dedupe", "Skip — already_sent", { notificationId: notification.id });
    return {
      sent: 0,
      fcmSent: 0,
      skipped: "already_sent",
      badge: 0,
      staleFcm: 0,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
      messageIds: [],
    };
  }

  const payload = buildNotificationPushPayload(notification);
  pushServerLog("2", "Built push payload", {
    title: payload.title,
    bodyPreview: payload.body.slice(0, 80),
  });

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
