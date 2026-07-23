import { loadDmInboxPreferences } from "@/lib/chatInboxPreferences";
import type { DirectMessageType } from "@/lib/directConversations";
import type { TranslationKey } from "@/lib/i18n/messages";
import { publicProfileUsername } from "@/lib/publicProfile";
import { countUnreadRoomMessages } from "@/lib/roomMemberships";
import type { OptimisticReadExcludes } from "@/lib/chatUnreadSync";
import { supabase } from "@/lib/supabaseClient";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function formatUnreadBadge(count: number) {
  if (count <= 0) {
    return null;
  }

  if (count > 9) {
    return "9+";
  }

  return String(count);
}

/**
 * Unread incoming DMs (includes spot_share_request).
 * Includes muted chats; excludes hidden/deleted conversations so the nav/app badge
 * matches the My Chats inbox.
 *
 * Count rule: recipient_id = me, sender ≠ me, read_at IS NULL.
 */
export async function countUnreadDirectMessages(
  userId: string,
  excludes?: OptimisticReadExcludes
) {
  const [{ data, error }, prefsResult] = await Promise.all([
    supabase
      .from("direct_messages")
      .select("sender_id")
      .eq("recipient_id", userId)
      .is("read_at", null)
      .neq("sender_id", userId),
    loadDmInboxPreferences(userId),
  ]);

  if (error) {
    return { count: 0, error: error.message };
  }

  const excludedPartners = excludes?.dmPartners;
  const count = (data ?? []).filter((row) => {
    const senderId = String(row.sender_id);

    if (excludedPartners?.has(senderId)) {
      return false;
    }

    if (prefsResult.preferences.get(senderId)?.hidden) {
      return false;
    }

    return true;
  }).length;

  return { count, error: prefsResult.error };
}

export async function countUnreadDirectMessagesForPartner(recipientId: string, partnerId: string) {
  const { count, error } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("sender_id", partnerId)
    .is("read_at", null);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count ?? 0, error: null as string | null };
}

/** Mark incoming messages from a sender as delivered (recipient client ack). */
export async function markDirectMessagesDeliveredFromSender(recipientId: string, senderId: string) {
  void recipientId;

  const { data: rpcCount, error: rpcError } = await supabase.rpc("mark_dm_thread_delivered", {
    p_sender_id: senderId,
  });

  if (!rpcError) {
    const updatedCount = typeof rpcCount === "number" ? rpcCount : 0;
    return { error: null as string | null, updatedCount };
  }

  // Fallback for DBs that only have the recipient UPDATE policy.
  const deliveredAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("direct_messages")
    .update({ delivered_at: deliveredAt })
    .eq("recipient_id", recipientId)
    .eq("sender_id", senderId)
    .is("delivered_at", null)
    .select("id");

  if (error) {
    return { error: error.message, updatedCount: 0 };
  }

  return { error: null as string | null, updatedCount: data?.length ?? 0 };
}

/** Mark all pending incoming messages as delivered when inbox syncs. */
export async function markAllPendingDirectMessagesDelivered(recipientId: string) {
  const deliveredAt = new Date().toISOString();

  const { error } = await supabase
    .from("direct_messages")
    .update({ delivered_at: deliveredAt })
    .eq("recipient_id", recipientId)
    .is("delivered_at", null)
    .neq("sender_id", recipientId);

  if (error) {
    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function countUnreadSpotShareRequests(userId: string) {
  const { count, error } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .eq("message_type", "spot_share_request")
    .is("read_at", null)
    .neq("sender_id", userId);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count ?? 0, error: null as string | null };
}

/**
 * Persistently mark ALL unread incoming messages in a DM thread as read.
 * Verifies read_at was written; never reports success while unread rows remain.
 */
export async function markDirectMessagesReadInThread(recipientId: string, partnerId: string) {
  const { data: rpcCount, error: rpcError } = await supabase.rpc("mark_dm_thread_read", {
    p_sender_id: partnerId,
  });

  if (rpcError) {
    console.log("[DM read] mark_dm_thread_read failed — trying direct update", {
      error: rpcError.message,
    });

    const readAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("direct_messages")
      .update({
        read_at: readAt,
        delivered_at: readAt,
      })
      .eq("recipient_id", recipientId)
      .eq("sender_id", partnerId)
      .is("read_at", null)
      .select("id");

    if (error) {
      console.log("[DM read] direct mark-read failed", { error: error.message });
      return { error: "Unable to mark messages as read.", updatedCount: 0 };
    }

    const updatedCount = data?.length ?? 0;
    const { count: unreadAfter, error: verifyError } = await countUnreadDirectMessagesForPartner(
      recipientId,
      partnerId
    );

    if (verifyError || (unreadAfter ?? 0) > 0) {
      console.error("[DM read] unread remains after direct mark-read", {
        unreadAfter,
        verifyError,
      });
      return { error: "Unable to mark messages as read.", updatedCount: 0 };
    }

    console.log("[DM read] direct mark-read result=", { updatedCount });
    return { error: null as string | null, updatedCount };
  }

  const updatedCount = typeof rpcCount === "number" ? rpcCount : Number(rpcCount) || 0;
  const { count: unreadAfter, error: verifyError } = await countUnreadDirectMessagesForPartner(
    recipientId,
    partnerId
  );

  if (verifyError) {
    console.error("[DM read] post-read verify failed", verifyError);
    return { error: "Unable to verify messages as read.", updatedCount: 0 };
  }

  if ((unreadAfter ?? 0) > 0) {
    console.error("[DM read] mark_dm_thread_read left unread rows", {
      updatedCount,
      unreadAfter,
      partnerId,
    });
    return { error: "Unable to mark messages as read.", updatedCount: 0 };
  }

  console.log("[DM read] mark_dm_thread_read result=", { updatedCount, unreadAfter: 0 });
  return { error: null as string | null, updatedCount };
}

export function buildIncomingMessageToast(
  input: {
    senderUsername: string;
    messageType: DirectMessageType | string | null;
  },
  t: TranslateFn
) {
  const name = publicProfileUsername(input.senderUsername);

  if (input.messageType === "spot_share_request") {
    return t("chats.toast.checkspot", { name });
  }

  if (input.messageType === "spot") {
    return t("chats.toast.spot", { name });
  }

  return t("chats.toast.message", { name });
}

export function buildIncomingRoomMessageToast(
  input: {
    cityName: string;
    countryName: string;
  },
  t: TranslateFn
) {
  return t("chats.toast.roomMessage", {
    city: input.cityName,
    country: input.countryName,
  });
}

/** Sum of unread_count across every group the user belongs to (see get_user_group_inbox RPC). */
export async function countUnreadGroupMessages(userId: string) {
  const { data, error } = await supabase.rpc("get_user_group_inbox", { p_user_id: userId });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    const isMissingSchema =
      error.code === "42P01" ||
      error.code === "PGRST202" ||
      error.code === "PGRST205" ||
      message.includes("group_chat") ||
      (message.includes("function") && message.includes("schema cache"));

    if (isMissingSchema) {
      return { count: 0, error: null as string | null };
    }

    return { count: 0, error: error.message };
  }

  const count = ((data ?? []) as { unread_count?: number }[]).reduce(
    (sum, row) => sum + (row.unread_count ?? 0),
    0
  );

  return { count, error: null as string | null };
}

export async function countUnreadInboxMessages(
  userId: string,
  excludes?: OptimisticReadExcludes
) {
  const [directResult, roomResult, groupResult] = await Promise.all([
    countUnreadDirectMessages(userId, excludes),
    countUnreadRoomMessages(userId, excludes),
    countUnreadGroupMessages(userId),
  ]);

  return {
    count: directResult.count + roomResult.count + groupResult.count,
    error: directResult.error ?? roomResult.error ?? groupResult.error,
  };
}

export async function fetchProfileUsername(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.username) {
    return { username: "Someone" as const, error: error?.message ?? null };
  }

  return { username: publicProfileUsername(data.username), error: null };
}
