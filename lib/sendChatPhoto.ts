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
import { uploadPostMedia } from "@/lib/postMedia";
import { resolveCityRoomId } from "@/lib/roomExplore";
import { upsertRoomMembershipOnMessage } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

function assertChatPhoto(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be sent as a photo.");
  }
}

/**
 * Sends a photo message. Reuses message_type "text" with a fallback caption body (same
 * convention as voice/place messages) plus the image_url column — no new storage bucket, the
 * existing public "post-media" bucket (owner-path-scoped write, public read) already covers this.
 */
export async function sendDmPhoto(input: {
  senderId: string;
  recipientId: string;
  file: File;
}): Promise<{ message: DirectMessageRow | null; error: string | null }> {
  if (input.senderId === input.recipientId) {
    return { message: null, error: "You cannot message yourself." };
  }

  try {
    assertChatPhoto(input.file);
  } catch (caught) {
    return { message: null, error: caught instanceof Error ? caught.message : "Invalid photo." };
  }

  const ensured = await ensureConversationForOutgoingMessage(input.senderId, input.recipientId);

  if (ensured.sendBlockedReason) {
    return { message: null, error: ensured.sendBlockedReason };
  }

  if (ensured.error && !ensured.conversation) {
    return { message: null, error: ensured.error };
  }

  let mediaUrl: string;

  try {
    const uploaded = await uploadPostMedia(input.senderId, input.file);
    mediaUrl = uploaded.mediaUrl;
  } catch (caught) {
    return { message: null, error: caught instanceof Error ? caught.message : "Unable to upload photo." };
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      message_type: "text",
      body: "📷 Photo",
      image_url: mediaUrl,
      created_at: new Date().toISOString(),
    })
    .select(DIRECT_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send photo." };
  }

  await touchConversationUpdatedAt(input.senderId, input.recipientId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  return { message: normalizeDirectMessageRow(data), error: null };
}

export async function sendGroupPhoto(input: {
  groupId: string;
  senderId: string;
  file: File;
}): Promise<{ message: GroupChatMessageRow | null; error: string | null }> {
  try {
    assertChatPhoto(input.file);
  } catch (caught) {
    return { message: null, error: caught instanceof Error ? caught.message : "Invalid photo." };
  }

  let mediaUrl: string;

  try {
    const uploaded = await uploadPostMedia(input.senderId, input.file);
    mediaUrl = uploaded.mediaUrl;
  } catch (caught) {
    return { message: null, error: caught instanceof Error ? caught.message : "Unable to upload photo." };
  }

  const { data, error } = await supabase
    .from("group_chat_messages")
    .insert({
      group_id: input.groupId,
      sender_id: input.senderId,
      message_type: "text",
      body: "📷 Photo",
      image_url: mediaUrl,
    })
    .select(GROUP_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send photo." };
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  return { message: data as GroupChatMessageRow, error: null };
}

export async function sendCityRoomPhoto(input: {
  userId: string;
  countrySlug: string;
  citySlug: string;
  file: File;
}): Promise<{ message: CityMessageRawRow | null; error: string | null }> {
  try {
    assertChatPhoto(input.file);
  } catch (caught) {
    return { message: null, error: caught instanceof Error ? caught.message : "Invalid photo." };
  }

  const { cityId, error: resolveError } = await resolveCityRoomId(input.countrySlug, input.citySlug);

  if (!cityId) {
    return { message: null, error: resolveError ?? "City room not found." };
  }

  let mediaUrl: string;

  try {
    const uploaded = await uploadPostMedia(input.userId, input.file);
    mediaUrl = uploaded.mediaUrl;
  } catch (caught) {
    return { message: null, error: caught instanceof Error ? caught.message : "Unable to upload photo." };
  }

  const { data, error } = await supabase
    .from("city_messages")
    .insert({
      city_id: cityId,
      user_id: input.userId,
      content: "📷 Photo",
      image_url: mediaUrl,
    })
    .select(CITY_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message || "Unable to send photo." };
  }

  await upsertRoomMembershipOnMessage(input.userId, input.countrySlug, input.citySlug);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  return { message: data as CityMessageRawRow, error: null };
}
