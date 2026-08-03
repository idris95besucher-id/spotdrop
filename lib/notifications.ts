import type { TranslationKey } from "@/lib/i18n/messages";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export type NotificationType =
  | "direct_message"
  | "new_follower"
  | "post_comment"
  | "room_message"
  | "room_mention"
  | "group_message";

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
  actorUsername?: string | null;
  actorAvatarUrl?: string | null;
  actorIsVerified?: boolean | null;
  postThumbnailUrl?: string | null;
};

export function notificationPostId(notification: Pick<NotificationRow, "href" | "metadata" | "type">) {
  if (notification.type !== "post_comment") {
    return null;
  }

  const fromMeta = metadataString(notification.metadata ?? {}, "postId");
  if (fromMeta) {
    return fromMeta;
  }

  const match = notification.href.match(/^\/posts\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function notificationCommentId(notification: Pick<NotificationRow, "href" | "metadata" | "type" | "source_id">) {
  if (notification.type !== "post_comment") {
    return null;
  }

  const fromMeta = metadataString(notification.metadata ?? {}, "commentId");
  if (fromMeta) {
    return fromMeta;
  }

  try {
    const url = new URL(notification.href, "https://spotdrop.local");
    const fromQuery = url.searchParams.get("commentId");
    if (fromQuery) {
      return fromQuery;
    }
  } catch {
    // ignore malformed href
  }

  return notification.source_id || null;
}

export function buildPostCommentHref(postId: string, commentId?: string | null) {
  const params = new URLSearchParams({ comments: "1" });
  if (commentId) {
    params.set("commentId", commentId);
  }
  return `/posts/${postId}?${params.toString()}`;
}

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
      return {
        title: name,
        body: t("notifications.commentedOnSpot"),
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
    case "group_message": {
      const name = publicProfileUsername(metadataString(metadata, "senderUsername") || "Someone");
      const groupName = metadataString(metadata, "groupName") || t("group.chatInfo");
      const preview = metadataString(metadata, "preview");
      return {
        title: t("notifications.newMessage"),
        body: preview
          ? `${name} · ${groupName}: ${preview}`
          : t("chats.toast.message", { name: `${name} · ${groupName}` }),
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
      const preview = metadataString(metadata, "preview");
      const messageType = metadataString(metadata, "messageType");

      if (preview) {
        return { title: name, body: preview };
      }

      if (messageType === "spot_share_request") {
        return { title: name, body: "Sent you a CheckSpot request" };
      }

      if (messageType === "spot") {
        return { title: name, body: "Sent you a Spot" };
      }

      return { title: name, body: "Sent you a message" };
    }
    case "new_follower": {
      const name = publicProfileUsername(metadataString(metadata, "followerUsername") || "Someone");
      return { title: "New follower", body: `${name} started following you` };
    }
    case "post_comment": {
      const name = publicProfileUsername(metadataString(metadata, "commenterUsername") || "Someone");
      // Identify the commenter; do not include comment body (may be private/sensitive).
      return {
        title: name,
        body: "commented on your Spot",
      };
    }
    case "room_message": {
      const city = metadataString(metadata, "cityName") || "City room";
      const preview = metadataString(metadata, "preview");
      return {
        title: city,
        body: preview || "New room message",
      };
    }
    case "room_mention": {
      const name = publicProfileUsername(metadataString(metadata, "senderUsername") || "Someone");
      const city = metadataString(metadata, "cityName") || "City room";
      const preview = metadataString(metadata, "preview");
      return {
        title: city,
        body: preview ? `${name}: ${preview}` : `${name} mentioned you`,
      };
    }
    case "group_message": {
      const name = publicProfileUsername(metadataString(metadata, "senderUsername") || "Someone");
      const groupName = metadataString(metadata, "groupName") || "Group";
      const preview = metadataString(metadata, "preview");
      return {
        title: groupName,
        body: preview ? `${name}: ${preview}` : `${name} sent a message`,
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

  const base = (data ?? []).map((row) => {
    const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      type: row.type as NotificationType,
      actor_id: row.actor_id ? String(row.actor_id) : null,
      href: String(row.href),
      source_id: String(row.source_id),
      metadata,
      read_at: (row.read_at as string | null) ?? null,
      created_at: String(row.created_at),
      postThumbnailUrl: metadataString(metadata, "postThumbnailUrl") || null,
    };
  });

  const actorIds = [...new Set(base.map((row) => row.actor_id).filter(Boolean))] as string[];
  const actorById = new Map<
    string,
    { username: string | null; avatar_url: string | null; is_verified: boolean | null }
  >();

  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, is_verified")
      .in("id", actorIds);

    for (const profile of profiles ?? []) {
      actorById.set(String(profile.id), {
        username: (profile.username as string | null) ?? null,
        avatar_url: (profile.avatar_url as string | null) ?? null,
        is_verified: (profile.is_verified as boolean | null) ?? null,
      });
    }
  }

  // Fill missing Spot thumbnails for older comment notifications.
  const missingThumbPostIds = [
    ...new Set(
      base
        .filter((row) => row.type === "post_comment" && !row.postThumbnailUrl)
        .map((row) => notificationPostId(row))
        .filter(Boolean)
    ),
  ] as string[];

  const thumbByPostId = new Map<string, string | null>();

  if (missingThumbPostIds.length > 0) {
    const { data: posts } = await supabase
      .from("posts")
      .select("id, video_cover_url, thumbnail_url, image_url, media_url, media_type, video_url")
      .in("id", missingThumbPostIds);

    for (const post of posts ?? []) {
      const thumb =
        (post.video_cover_url as string | null)?.trim() ||
        (post.thumbnail_url as string | null)?.trim() ||
        (post.image_url as string | null)?.trim() ||
        (post.media_url as string | null)?.trim() ||
        null;
      thumbByPostId.set(String(post.id), thumb);
    }
  }

  const notifications: NotificationRow[] = base.map((row) => {
    const actor = row.actor_id ? actorById.get(row.actor_id) : null;
    const postId = notificationPostId(row);
    const commentId = notificationCommentId(row);
    const href =
      row.type === "post_comment" && postId
        ? buildPostCommentHref(postId, commentId)
        : row.href;

    return {
      ...row,
      href,
      actorUsername:
        actor?.username ?? (metadataString(row.metadata, "commenterUsername") || null),
      actorAvatarUrl: actor?.avatar_url ?? null,
      actorIsVerified: actor?.is_verified ?? null,
      postThumbnailUrl:
        row.postThumbnailUrl || (postId ? (thumbByPostId.get(postId) ?? null) : null),
    };
  });

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
