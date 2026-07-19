import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import {
  encodeCityRoomPlaceMessage,
  type CityRoomPlacePayload,
} from "@/lib/cityRoomPlaceMessage";
import { ensureConversationForOutgoingMessage, touchConversationUpdatedAt } from "@/lib/directConversations";
import { resolveCityRoomId } from "@/lib/roomExplore";
import { requestMessagePush } from "@/lib/requestMessagePush";
import { upsertRoomMembershipOnMessage } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

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

export async function sendMapPlaceToCityRoom(input: {
  userId: string;
  countrySlug: string;
  citySlug: string;
  place: CityRoomPlacePayload;
}): Promise<{ error: string | null }> {
  const { cityId, error: resolveError } = await resolveCityRoomId(
    input.countrySlug,
    input.citySlug
  );

  if (!cityId) {
    return { error: resolveError ?? "City room not found." };
  }

  const content = encodeCityRoomPlaceMessage(input.place);

  const { data: inserted, error } = await supabase
    .from("city_messages")
    .insert({
      city_id: cityId,
      user_id: input.userId,
      content,
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

export async function sendMapPlaceToRecipient(input: {
  senderId: string;
  recipientId: string;
  place: CityRoomPlacePayload;
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

  const content = encodeCityRoomPlaceMessage(input.place);

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
    return { error: error.message || "Unable to send place." };
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

export async function sendMapPlaceToRecipients(input: {
  senderId: string;
  recipientIds: string[];
  place: CityRoomPlacePayload;
}): Promise<{ sentCount: number; error: string | null }> {
  const recipients = uniqueRecipientIds(input.senderId, input.recipientIds);

  if (recipients.length === 0) {
    return { sentCount: 0, error: "Choose at least one recipient." };
  }

  let sentCount = 0;
  let lastError: string | null = null;

  for (const recipientId of recipients) {
    const result = await sendMapPlaceToRecipient({
      senderId: input.senderId,
      recipientId,
      place: input.place,
    });

    if (result.error) {
      lastError = result.error;
      continue;
    }

    sentCount += 1;
  }

  if (sentCount === 0) {
    return { sentCount: 0, error: lastError ?? "Unable to send place." };
  }

  return {
    sentCount,
    error: sentCount < recipients.length ? lastError : null,
  };
}

/**
 * Sends a place card into a group chat. Reuses the exact same encoding as the DM path
 * (encodeCityRoomPlaceMessage → message_type "text" body with a [[spotdrop_place]] marker)
 * rather than a dedicated message_type, because group_chat_messages has a DB-level
 * `check (message_type in ('text', 'system'))` constraint — any other value is rejected at
 * the database, not just unrecognized by the UI. Group membership/RLS is enforced by the
 * existing "Group messages insert by member" policy (auth.uid() = sender_id and
 * is_group_chat_member(group_id, auth.uid())) — this will simply fail if the sender isn't
 * a member of the group, exactly like a normal text send would.
 */
export async function sendMapPlaceToGroup(input: {
  senderId: string;
  groupId: string;
  place: CityRoomPlacePayload;
}): Promise<{ error: string | null }> {
  const content = encodeCityRoomPlaceMessage(input.place);

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
    return { error: error.message || "Unable to send place to group." };
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  if (inserted?.id) {
    requestMessagePush({ messageId: String(inserted.id), type: "group_message" });
  }

  return { error: null };
}

export async function sendMapPlaceToGroups(input: {
  senderId: string;
  groupIds: string[];
  place: CityRoomPlacePayload;
}): Promise<{ sentCount: number; error: string | null }> {
  const groupIds = uniqueIds(input.groupIds);

  if (groupIds.length === 0) {
    return { sentCount: 0, error: "Choose at least one group." };
  }

  let sentCount = 0;
  let lastError: string | null = null;

  for (const groupId of groupIds) {
    const result = await sendMapPlaceToGroup({
      senderId: input.senderId,
      groupId,
      place: input.place,
    });

    if (result.error) {
      lastError = result.error;
      continue;
    }

    sentCount += 1;
  }

  if (sentCount === 0) {
    return { sentCount: 0, error: lastError ?? "Unable to send place to group." };
  }

  return {
    sentCount,
    error: sentCount < groupIds.length ? lastError : null,
  };
}

/**
 * Combined send across individual DM recipients and group chats — used by the "Send in DM"
 * sheet's multi-select picker, which lists both. Runs both loops and merges the counts so
 * "Send to N" reflects a single total, and a partial failure in one list doesn't silently
 * swallow a partial failure in the other.
 */
export async function sendMapPlaceToRecipientsAndGroups(input: {
  senderId: string;
  recipientIds: string[];
  groupIds: string[];
  place: CityRoomPlacePayload;
}): Promise<{ sentCount: number; error: string | null }> {
  const hasUsers = input.recipientIds.length > 0;
  const hasGroups = input.groupIds.length > 0;

  const [usersResult, groupsResult] = await Promise.all([
    hasUsers
      ? sendMapPlaceToRecipients({ senderId: input.senderId, recipientIds: input.recipientIds, place: input.place })
      : Promise.resolve({ sentCount: 0, error: null as string | null }),
    hasGroups
      ? sendMapPlaceToGroups({ senderId: input.senderId, groupIds: input.groupIds, place: input.place })
      : Promise.resolve({ sentCount: 0, error: null as string | null }),
  ]);

  const sentCount = usersResult.sentCount + groupsResult.sentCount;
  const error = usersResult.error ?? groupsResult.error;

  if (sentCount === 0) {
    return { sentCount: 0, error: error ?? "Unable to send place." };
  }

  return { sentCount, error };
}
