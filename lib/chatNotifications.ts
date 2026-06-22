import type { DirectMessageType } from "@/lib/directConversations";
import type { TranslationKey } from "@/lib/i18n/messages";
import { publicProfileUsername } from "@/lib/publicProfile";
import { countUnreadRoomMessages } from "@/lib/roomMemberships";
import { loadMutedDmPartnerIds } from "@/lib/chatInboxPreferences";
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

/** Unread incoming DMs (includes spot_share_request). Respects muted chats. */
export async function countUnreadDirectMessages(userId: string) {
  const [{ data, error }, mutedResult] = await Promise.all([
    supabase
      .from("direct_messages")
      .select("sender_id")
      .eq("recipient_id", userId)
      .is("read_at", null)
      .neq("sender_id", userId),
    loadMutedDmPartnerIds(userId),
  ]);

  if (error) {
    return { count: 0, error: error.message };
  }

  const mutedPartners = mutedResult.partnerIds;
  const count = (data ?? []).filter((row) => !mutedPartners.has(String(row.sender_id))).length;

  return { count, error: null as string | null };
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

export async function markDirectMessagesReadInThread(recipientId: string, partnerId: string) {
  const readAt = new Date().toISOString();

  const { error } = await supabase
    .from("direct_messages")
    .update({ read_at: readAt })
    .eq("recipient_id", recipientId)
    .eq("sender_id", partnerId)
    .is("read_at", null);

  if (error) {
    return { error: error.message };
  }

  return { error: null as string | null };
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

export async function countUnreadInboxMessages(userId: string) {
  const [directResult, roomResult] = await Promise.all([
    countUnreadDirectMessages(userId),
    countUnreadRoomMessages(userId),
  ]);

  return {
    count: directResult.count + roomResult.count,
    error: directResult.error ?? roomResult.error,
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
