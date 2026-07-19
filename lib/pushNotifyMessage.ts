import { createClient } from "@supabase/supabase-js";
import type { NotificationRow } from "@/lib/notifications";
import { pushServerLog } from "@/lib/pushServerLog";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { mapNotificationRow } from "@/lib/serverPushSend";

export const MESSAGE_PUSH_TYPES = new Set([
  "direct_message",
  "group_message",
  "room_message",
  "room_mention",
]);

export async function resolveAuthenticatedUserId(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user?.id) {
    return null;
  }

  return data.user.id;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadNotificationsForMessage(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  messageId: string,
  type: string,
  actorId: string
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let query = admin
      .from("notifications")
      .select("id, user_id, type, actor_id, href, source_id, metadata, read_at, created_at")
      .eq("type", type)
      .eq("actor_id", actorId);

    if (type === "direct_message") {
      query = query.eq("source_id", messageId);
    } else {
      query = query.like("source_id", `${messageId}:%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      pushServerLog("1", "Notification rows found for message", {
        messageId,
        type,
        attempt: attempt + 1,
        count: data.length,
        recipientUserIds: data.map((row) => row.user_id),
      });
      return data.map(mapNotificationRow);
    }

    pushServerLog("1", "Notification rows not ready yet — retry", {
      messageId,
      type,
      attempt: attempt + 1,
    });
    await sleep(150);
  }

  return [] as NotificationRow[];
}
