import type { TranslationKey } from "@/lib/i18n/messages";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export type NotificationType =
  | "direct_message"
  | "new_follower"
  | "post_comment"
  | "room_message"
  | "room_mention";

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string | null;
  href: string;
  source_id: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

export function buildNotificationCopy(
  notification: Pick<NotificationRow, "type" | "metadata">,
  t: TranslateFn
) {
  const metadata = notification.metadata ?? {};

  switch (notification.type) {
    case "direct_message": {
      const name = publicProfileUsername(metadataString(metadata, "senderUsername") || "Someone");
      const messageType = metadataString(metadata, "messageType");

      if (messageType === "spot_share_request") {
        return {
          title: t("notifications.newMessage"),
          body: t("chats.toast.checkspot", { name }),
        };
      }

      if (messageType === "spot") {
        return {
          title: t("notifications.newMessage"),
          body: t("chats.toast.spot", { name }),
        };
      }

      return {
        title: t("notifications.newMessage"),
        body: t("chats.toast.message", { name }),
      };
    }
    case "new_follower": {
      const name = publicProfileUsername(metadataString(metadata, "followerUsername") || "Someone");
      return {
        title: t("notifications.newFollower"),
        body: t("notifications.followedYou", { name }),
      };
    }
    case "post_comment": {
      const name = publicProfileUsername(metadataString(metadata, "commenterUsername") || "Someone");
      const preview = metadataString(metadata, "preview");
      return {
        title: t("notifications.newComment"),
        body: preview
          ? t("notifications.commentedPreview", { name, preview })
          : t("notifications.commented", { name }),
      };
    }
    case "room_message": {
      const city = metadataString(metadata, "cityName") || t("notifications.aCityRoom");
      return {
        title: t("notifications.newRoomMessages"),
        body: t("notifications.roomMessagesIn", { city }),
      };
    }
    case "room_mention": {
      const name = publicProfileUsername(metadataString(metadata, "senderUsername") || "Someone");
      const city = metadataString(metadata, "cityName") || t("notifications.aCityRoom");
      const preview = metadataString(metadata, "preview");
      return {
        title: t("notifications.roomMention"),
        body: preview
          ? t("notifications.mentionedPreview", { name, city, preview })
          : t("notifications.mentionedIn", { name, city }),
      };
    }
    default:
      return {
        title: t("notifications.title"),
        body: t("notifications.generic"),
      };
  }
}

/** English copy for server-side Web Push delivery. */
export function buildNotificationPushPayload(notification: Pick<NotificationRow, "type" | "metadata">) {
  const metadata = notification.metadata ?? {};

  switch (notification.type) {
    case "direct_message": {
      const name = publicProfileUsername(metadataString(metadata, "senderUsername") || "Someone");
      const messageType = metadataString(metadata, "messageType");

      if (messageType === "spot_share_request") {
        return { title: "New message", body: `${name} sent you a CheckSpot request` };
      }

      if (messageType === "spot") {
        return { title: "New message", body: `${name} sent you a Spot` };
      }

      return { title: "New message", body: `${name} sent you a message` };
    }
    case "new_follower": {
      const name = publicProfileUsername(metadataString(metadata, "followerUsername") || "Someone");
      return { title: "New follower", body: `${name} started following you` };
    }
    case "post_comment": {
      const name = publicProfileUsername(metadataString(metadata, "commenterUsername") || "Someone");
      const preview = metadataString(metadata, "preview");
      return {
        title: "New comment",
        body: preview ? `${name}: ${preview}` : `${name} commented on your post`,
      };
    }
    case "room_message": {
      const city = metadataString(metadata, "cityName") || "your city room";
      return { title: "City room", body: `New messages in ${city}` };
    }
    case "room_mention": {
      const name = publicProfileUsername(metadataString(metadata, "senderUsername") || "Someone");
      const city = metadataString(metadata, "cityName") || "a city room";
      const preview = metadataString(metadata, "preview");
      return {
        title: "You were mentioned",
        body: preview ? `${name} mentioned you in ${city}: ${preview}` : `${name} mentioned you in ${city}`,
      };
    }
    default:
      return { title: "SpotDrop", body: "You have a new notification" };
  }
}

export function isMissingNotificationsTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("notifications") && message.includes("does not exist"))
  );
}

export async function fetchNotifications(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, type, actor_id, href, source_id, metadata, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingNotificationsTable(error)) {
      return { notifications: [] as NotificationRow[], error: null as string | null };
    }

    return { notifications: [] as NotificationRow[], error: error.message };
  }

  const notifications = (data ?? []).map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    type: row.type as NotificationType,
    actor_id: row.actor_id ? String(row.actor_id) : null,
    href: String(row.href),
    source_id: String(row.source_id),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    read_at: (row.read_at as string | null) ?? null,
    created_at: String(row.created_at),
  }));

  return { notifications, error: null as string | null };
}

export async function countUnreadNotifications(userId: string) {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    if (isMissingNotificationsTable(error)) {
      return { count: 0, error: null as string | null };
    }

    return { count: 0, error: error.message };
  }

  return { count: count ?? 0, error: null as string | null };
}

export async function markNotificationRead(notificationId: string) {
  const readAt = new Date().toISOString();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("id", notificationId)
    .is("read_at", null);

  if (error) {
    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function markAllNotificationsRead(userId: string) {
  const readAt = new Date().toISOString();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    return { error: error.message };
  }

  return { error: null as string | null };
}

export const NOTIFICATIONS_REFRESH_EVENT = "spotdrop:notifications-refresh";

export function dispatchNotificationsRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
  }
}
