import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import {
  DIRECT_MESSAGE_SELECT,
  ensureConversationForOutgoingMessage,
  normalizeDirectMessageRow,
  touchConversationUpdatedAt,
  type DirectMessageRow,
} from "@/lib/directConversations";
import { CITY_MESSAGE_SELECT, type CityMessageRawRow } from "@/lib/cityMessageRow";
import { resolveCityRoomId } from "@/lib/roomExplore";
import { requestMessagePush } from "@/lib/requestMessagePush";
import { upsertRoomMembershipOnMessage } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

/**
 * Sends a voice message in a DM. Reuses message_type "text" with a fallback caption body
 * (mirrors the existing place-card pattern in lib/sendMapPlaceMessage.ts) so no change to
 * direct_messages' per-type body CHECK constraint was needed. audio_url is the discriminator
 * the UI checks for, before any other message_type/body handling.
 */
export async function sendDmVoiceMessage(input: {
  senderId: string;
  recipientId: string;
  audioUrl: string;
  durationSeconds: number;
  waveform: number[];
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
      body: "🎤 Voice message",
      audio_url: input.audioUrl,
      audio_duration_seconds: input.durationSeconds,
      audio_waveform: input.waveform,
      created_at: new Date().toISOString(),
    })
    .select(DIRECT_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send voice message." };
  }

  await touchConversationUpdatedAt(input.senderId, input.recipientId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  const message = normalizeDirectMessageRow(data);
  requestMessagePush({ messageId: message.id, type: "direct_message" });

  return { message, error: null };
}

export async function sendCityRoomVoiceMessage(input: {
  userId: string;
  countrySlug: string;
  citySlug: string;
  audioUrl: string;
  durationSeconds: number;
  waveform: number[];
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
      content: "🎤 Voice message",
      audio_url: input.audioUrl,
      audio_duration_seconds: input.durationSeconds,
      audio_waveform: input.waveform,
    })
    .select(CITY_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send voice message." };
  }

  await upsertRoomMembershipOnMessage(input.userId, input.countrySlug, input.citySlug);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  const message = data as CityMessageRawRow;
  requestMessagePush({ messageId: message.id, type: "room_message" });

  return { message, error: null };
}
