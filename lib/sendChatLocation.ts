import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import {
  DIRECT_MESSAGE_SELECT,
  ensureConversationForOutgoingMessage,
  normalizeDirectMessageRow,
  touchConversationUpdatedAt,
  type DirectMessageRow,
} from "@/lib/directConversations";
import { CITY_MESSAGE_SELECT, type CityMessageRawRow } from "@/lib/cityMessageRow";
import type { GroupChatMessageRow } from "@/lib/groupChatMessages";
import { resolveCityRoomId } from "@/lib/roomExplore";
import { upsertRoomMembershipOnMessage } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

type LocationFields = {
  live_location_lat: number;
  live_location_lng: number;
  live_location_updated_at: string;
  live_location_expires_at: string | null;
};

function locationInsertFields(latitude: number, longitude: number, expiresAt: string | null): LocationFields {
  return {
    live_location_lat: latitude,
    live_location_lng: longitude,
    live_location_updated_at: new Date().toISOString(),
    live_location_expires_at: expiresAt,
  };
}

export async function sendDmLocation(input: {
  senderId: string;
  recipientId: string;
  latitude: number;
  longitude: number;
  expiresAt: string | null;
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
      body: input.expiresAt ? "📍 Live location" : "📍 Current location",
      created_at: new Date().toISOString(),
      ...locationInsertFields(input.latitude, input.longitude, input.expiresAt),
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

export async function updateDmLocation(input: {
  messageId: string;
  senderId: string;
  latitude: number;
  longitude: number;
  expiresAt: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("direct_messages")
    .update(locationInsertFields(input.latitude, input.longitude, input.expiresAt))
    .eq("id", input.messageId)
    .eq("sender_id", input.senderId);

  return { error: error?.message ?? null };
}

export async function sendGroupLocation(input: {
  groupId: string;
  senderId: string;
  latitude: number;
  longitude: number;
  expiresAt: string | null;
}): Promise<{ message: GroupChatMessageRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("group_chat_messages")
    .insert({
      group_id: input.groupId,
      sender_id: input.senderId,
      message_type: "text",
      body: input.expiresAt ? "📍 Live location" : "📍 Current location",
      ...locationInsertFields(input.latitude, input.longitude, input.expiresAt),
    })
    .select(
      "id, group_id, sender_id, message_type, body, post_id, created_at, audio_url, audio_duration_seconds, audio_waveform, image_url, live_location_lat, live_location_lng, live_location_updated_at, live_location_expires_at"
    )
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send location." };
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  return { message: data as GroupChatMessageRow, error: null };
}

export async function updateGroupLocation(input: {
  messageId: string;
  senderId: string;
  latitude: number;
  longitude: number;
  expiresAt: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("group_chat_messages")
    .update(locationInsertFields(input.latitude, input.longitude, input.expiresAt))
    .eq("id", input.messageId)
    .eq("sender_id", input.senderId);

  return { error: error?.message ?? null };
}

export async function sendCityRoomLocation(input: {
  userId: string;
  countrySlug: string;
  citySlug: string;
  latitude: number;
  longitude: number;
  expiresAt: string | null;
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
      content: input.expiresAt ? "📍 Live location" : "📍 Current location",
      ...locationInsertFields(input.latitude, input.longitude, input.expiresAt),
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

export async function updateCityRoomLocation(input: {
  messageId: string;
  userId: string;
  latitude: number;
  longitude: number;
  expiresAt: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("city_messages")
    .update(locationInsertFields(input.latitude, input.longitude, input.expiresAt))
    .eq("id", input.messageId)
    .eq("user_id", input.userId);

  return { error: error?.message ?? null };
}
