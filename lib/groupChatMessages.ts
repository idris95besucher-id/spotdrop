import { supabase } from "@/lib/supabaseClient";

export type GroupChatMessageType = "text" | "system";

export type GroupChatMessageRow = {
  id: string;
  group_id: string;
  sender_id: string;
  message_type: GroupChatMessageType;
  body: string | null;
  post_id: string | null;
  created_at: string;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  audio_waveform: number[] | null;
  image_url: string | null;
  live_location_lat: number | null;
  live_location_lng: number | null;
  live_location_updated_at: string | null;
  live_location_expires_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
};

/** Exported so every group message sender (voice/photo/location/text) selects the exact same column set — no drift. */
export const MESSAGE_SELECT =
  "id, group_id, sender_id, message_type, body, post_id, created_at, audio_url, audio_duration_seconds, audio_waveform, image_url, live_location_lat, live_location_lng, live_location_updated_at, live_location_expires_at, edited_at, deleted_at";

function logGroupMessageError(context: string, error: { message?: string; code?: string; details?: string | null; hint?: string | null } | null) {
  if (!error) {
    return;
  }

  console.error(`[group-chat-messages] ${context} failed`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

export async function loadGroupMessagesForThread(
  groupId: string
): Promise<{ messages: GroupChatMessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("group_chat_messages")
    .select(MESSAGE_SELECT)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    logGroupMessageError("load messages", error);
    return { messages: [], error: error.message };
  }

  return { messages: (data ?? []) as GroupChatMessageRow[], error: null };
}

export async function fetchNewGroupMessagesForThread(
  groupId: string,
  afterCreatedAt: string | null
): Promise<{ messages: GroupChatMessageRow[]; error: string | null }> {
  let query = supabase
    .from("group_chat_messages")
    .select(MESSAGE_SELECT)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (afterCreatedAt) {
    query = query.gt("created_at", afterCreatedAt);
  }

  const { data, error } = await query;

  if (error) {
    logGroupMessageError("fetch new messages", error);
    return { messages: [], error: error.message };
  }

  return { messages: (data ?? []) as GroupChatMessageRow[], error: null };
}

export async function sendGroupTextMessage(
  groupId: string,
  senderId: string,
  body: string
): Promise<{ message: GroupChatMessageRow | null; error: string | null }> {
  const trimmed = body.trim();

  if (!trimmed) {
    return { message: null, error: null };
  }

  const { data, error } = await supabase
    .from("group_chat_messages")
    .insert({
      group_id: groupId,
      sender_id: senderId,
      message_type: "text",
      body: trimmed,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (error) {
    logGroupMessageError("send message", error);
    return { message: null, error: error.message };
  }

  return { message: data as GroupChatMessageRow, error: null };
}

/**
 * Sends a voice message into a group chat. Reuses message_type "text" with a fallback
 * caption body (rather than a new message_type) — group_chat_messages has a DB-level
 * `check (message_type in ('text', 'system'))` constraint, so this avoids a schema change.
 * The client distinguishes a voice message by audio_url being non-null, checked before any
 * other message_type/body handling.
 */
export async function sendGroupVoiceMessage(
  groupId: string,
  senderId: string,
  audioUrl: string,
  durationSeconds: number,
  waveform: number[]
): Promise<{ message: GroupChatMessageRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("group_chat_messages")
    .insert({
      group_id: groupId,
      sender_id: senderId,
      message_type: "text",
      body: "🎤 Voice message",
      audio_url: audioUrl,
      audio_duration_seconds: durationSeconds,
      audio_waveform: waveform,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (error) {
    logGroupMessageError("send voice message", error);
    return { message: null, error: error.message };
  }

  return { message: data as GroupChatMessageRow, error: null };
}
