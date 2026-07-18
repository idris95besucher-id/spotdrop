import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import {
  DIRECT_MESSAGE_SELECT,
  ensureConversationForOutgoingMessage,
  normalizeDirectMessageRow,
  touchConversationUpdatedAt,
  type DirectMessageRow,
} from "@/lib/directConversations";
import { CITY_MESSAGE_SELECT, type CityMessageRawRow } from "@/lib/cityMessageRow";
import { MESSAGE_SELECT as GROUP_MESSAGE_SELECT, type GroupChatMessageRow } from "@/lib/groupChatMessages";
import { resolveCityRoomId } from "@/lib/roomExplore";
import { upsertRoomMembershipOnMessage } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

function locationInsertFields(latitude: number, longitude: number) {
  return {
    live_location_lat: latitude,
    live_location_lng: longitude,
    live_location_updated_at: new Date().toISOString(),
  };
}

export async function sendDmLocation(input: {
  senderId: string;
  recipientId: string;
  latitude: number;
  longitude: number;
}): Promise<{ message: DirectMessageRow | null; error: string | null }> {
  if (input.senderId === input.recipientId) {
    return { message: null, error: "You cannot message yourself." };
  }

  const ensured = await ensureConversationForOutgoingMessage(input.senderId, input.recipientId);

  if (ensured.sendBlockedReason) {
    return { message: null, error: ensured.sendBlockedReason };
  }

  if (ensured.error && !ensured.conversation) {
    return { message: null, error: ensured.error };
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      message_type: "text",
      body: "📍 Current location",
      created_at: new Date().toISOString(),
      ...locationInsertFields(input.latitude, input.longitude),
    })
    .select(DIRECT_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send location." };
  }

  await touchConversationUpdatedAt(input.senderId, input.recipientId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  return { message: normalizeDirectMessageRow(data), error: null };
}

export async function sendGroupLocation(input: {
  groupId: string;
  senderId: string;
  latitude: number;
  longitude: number;
}): Promise<{ message: GroupChatMessageRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("group_chat_messages")
    .insert({
      group_id: input.groupId,
      sender_id: input.senderId,
      message_type: "text",
      body: "📍 Current location",
      ...locationInsertFields(input.latitude, input.longitude),
    })
    .select(GROUP_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send location." };
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  return { message: data as GroupChatMessageRow, error: null };
}

export async function sendCityRoomLocation(input: {
  userId: string;
  countrySlug: string;
  citySlug: string;
  latitude: number;
  longitude: number;
}): Promise<{ message: CityMessageRawRow | null; error: string | null }> {
  const { cityId, error: resolveError } = await resolveCityRoomId(input.countrySlug, input.citySlug);

  if (!cityId) {
    return { message: null, error: resolveError ?? "City room not found." };
  }

  const { data, error } = await supabase
    .from("city_messages")
    .insert({
      city_id: cityId,
      user_id: input.userId,
      content: "📍 Current location",
      ...locationInsertFields(input.latitude, input.longitude),
    })
    .select(CITY_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send location." };
  }

  await upsertRoomMembershipOnMessage(input.userId, input.countrySlug, input.citySlug);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  return { message: data as CityMessageRawRow, error: null };
}
