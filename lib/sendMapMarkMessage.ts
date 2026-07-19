import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import {
  encodeCityRoomMapMarkMessage,
  type CityRoomMapMarkPayload,
} from "@/lib/cityRoomMapMarkMessage";
import { ensureConversationForOutgoingMessage, touchConversationUpdatedAt } from "@/lib/directConversations";
import { resolveCityRoomId } from "@/lib/roomExplore";
import { requestMessagePush } from "@/lib/requestMessagePush";
import { upsertRoomMembershipOnMessage } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

/**
 * Sends an existing Mark as a clickable card into DMs, group chats, and city rooms — the
 * counterpart of lib/sendMapPlaceMessage.ts for the "Share" button on MapMarkDetailSheet.
 * Encoding/permissions mirror that module exactly (same [[spotdrop_...]] marker convention,
 * same RLS-enforced insert paths); the only difference is the payload shape (Mark, with a
 * denormalized creator) instead of a generic searched place.
 */

function uniqueRecipientIds(senderId: string, recipientIds: string[]) {
  const seen = new Set<string>();

  return recipientIds.filter((recipientId) => {
    const normalized = recipientId.trim();

    if (!normalized || normalized === senderId || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function uniqueIds(ids: string[]) {
  const seen = new Set<string>();

  return ids.filter((id) => {
    const normalized = id.trim();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

export async function sendMapMarkToCityRoom(input: {
  userId: string;
  countrySlug: string;
  citySlug: string;
  mark: CityRoomMapMarkPayload;
}): Promise<{ error: string | null }> {
  const { cityId, error: resolveError } = await resolveCityRoomId(
    input.countrySlug,
    input.citySlug
  );

  if (!cityId) {
    return { error: resolveError ?? "City room not found." };
  }

  const content = encodeCityRoomMapMarkMessage(input.mark);

  const { data: inserted, error } = await supabase
    .from("city_messages")
    .insert({
      city_id: cityId,
      user_id: input.userId,
      content,
      map_mark_id: input.mark.mapMarkId,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message || "Unable to send to City Room." };
  }

  await upsertRoomMembershipOnMessage(input.userId, input.countrySlug, input.citySlug);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  if (inserted?.id) {
    requestMessagePush({ messageId: String(inserted.id), type: "room_message" });
  }

  return { error: null };
}

export async function sendMapMarkToRecipient(input: {
  senderId: string;
  recipientId: string;
  mark: CityRoomMapMarkPayload;
}): Promise<{ error: string | null }> {
  if (input.senderId === input.recipientId) {
    return { error: "You cannot message yourself." };
  }

  const ensured = await ensureConversationForOutgoingMessage(input.senderId, input.recipientId);

  if (ensured.sendBlockedReason) {
    return { error: ensured.sendBlockedReason };
  }

  if (ensured.error && !ensured.conversation) {
    return { error: ensured.error };
  }

  const content = encodeCityRoomMapMarkMessage(input.mark);

  const { data: inserted, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      message_type: "text",
      body: content,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message || "Unable to send Mark." };
  }

  await touchConversationUpdatedAt(input.senderId, input.recipientId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  if (inserted?.id) {
    requestMessagePush({ messageId: String(inserted.id), type: "direct_message" });
  }

  return { error: null };
}

export async function sendMapMarkToRecipients(input: {
  senderId: string;
  recipientIds: string[];
  mark: CityRoomMapMarkPayload;
}): Promise<{ sentCount: number; error: string | null }> {
  const recipients = uniqueRecipientIds(input.senderId, input.recipientIds);

  if (recipients.length === 0) {
    return { sentCount: 0, error: "Choose at least one recipient." };
  }

  let sentCount = 0;
  let lastError: string | null = null;

  for (const recipientId of recipients) {
    const result = await sendMapMarkToRecipient({
      senderId: input.senderId,
      recipientId,
      mark: input.mark,
    });

    if (result.error) {
      lastError = result.error;
      continue;
    }

    sentCount += 1;
  }

  if (sentCount === 0) {
    return { sentCount: 0, error: lastError ?? "Unable to send Mark." };
  }

  return {
    sentCount,
    error: sentCount < recipients.length ? lastError : null,
  };
}

/**
 * Sends a Mark card into a group chat. Same "text" message_type as the DM path (group_chat_messages
 * has a DB-level `check (message_type in ('text', 'system'))` constraint), and group membership/RLS
 * is enforced by the existing "Group messages insert by member" policy — this fails naturally if the
 * sender isn't a member of the group.
 */
export async function sendMapMarkToGroup(input: {
  senderId: string;
  groupId: string;
  mark: CityRoomMapMarkPayload;
}): Promise<{ error: string | null }> {
  const content = encodeCityRoomMapMarkMessage(input.mark);

  const { data: inserted, error } = await supabase
    .from("group_chat_messages")
    .insert({
      group_id: input.groupId,
      sender_id: input.senderId,
      message_type: "text",
      body: content,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message || "Unable to send Mark to group." };
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  if (inserted?.id) {
    requestMessagePush({ messageId: String(inserted.id), type: "group_message" });
  }

  return { error: null };
}

export async function sendMapMarkToGroups(input: {
  senderId: string;
  groupIds: string[];
  mark: CityRoomMapMarkPayload;
}): Promise<{ sentCount: number; error: string | null }> {
  const groupIds = uniqueIds(input.groupIds);

  if (groupIds.length === 0) {
    return { sentCount: 0, error: "Choose at least one group." };
  }

  let sentCount = 0;
  let lastError: string | null = null;

  for (const groupId of groupIds) {
    const result = await sendMapMarkToGroup({
      senderId: input.senderId,
      groupId,
      mark: input.mark,
    });

    if (result.error) {
      lastError = result.error;
      continue;
    }

    sentCount += 1;
  }

  if (sentCount === 0) {
    return { sentCount: 0, error: lastError ?? "Unable to send Mark to group." };
  }

  return {
    sentCount,
    error: sentCount < groupIds.length ? lastError : null,
  };
}

/** Combined send across individual DM recipients and group chats — powers the "Send in DM" sheet's single multi-select picker that lists both. */
export async function sendMapMarkToRecipientsAndGroups(input: {
  senderId: string;
  recipientIds: string[];
  groupIds: string[];
  mark: CityRoomMapMarkPayload;
}): Promise<{ sentCount: number; error: string | null }> {
  const hasUsers = input.recipientIds.length > 0;
  const hasGroups = input.groupIds.length > 0;

  const [usersResult, groupsResult] = await Promise.all([
    hasUsers
      ? sendMapMarkToRecipients({ senderId: input.senderId, recipientIds: input.recipientIds, mark: input.mark })
      : Promise.resolve({ sentCount: 0, error: null as string | null }),
    hasGroups
      ? sendMapMarkToGroups({ senderId: input.senderId, groupIds: input.groupIds, mark: input.mark })
      : Promise.resolve({ sentCount: 0, error: null as string | null }),
  ]);

  const sentCount = usersResult.sentCount + groupsResult.sentCount;
  const error = usersResult.error ?? groupsResult.error;

  if (sentCount === 0) {
    return { sentCount: 0, error: error ?? "Unable to send Mark." };
  }

  return { sentCount, error };
}
