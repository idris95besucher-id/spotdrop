import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import { ensureConversationForOutgoingMessage, touchConversationUpdatedAt } from "@/lib/directConversations";
import { normalizePostId, postIdForQuery } from "@/lib/postIds";
import { requestMessagePush } from "@/lib/requestMessagePush";
import { supabase } from "@/lib/supabaseClient";

const DM_INSERT_SELECT =
  "id, sender_id, recipient_id, body, message_type, spot_share_id, post_id, created_at";

export const MISSING_SPOT_POST_ID_ERROR = "Cannot send Spot: missing post_id";

function requireSpotDirectMessagePostId(postId: string): string | number {
  const normalizedPostId = normalizePostId(postId);

  if (!normalizedPostId) {
    throw new Error(MISSING_SPOT_POST_ID_ERROR);
  }

  const postIdForInsert = postIdForQuery(normalizedPostId);

  if (
    postIdForInsert === null ||
    postIdForInsert === undefined ||
    String(postIdForInsert).trim() === ""
  ) {
    throw new Error(MISSING_SPOT_POST_ID_ERROR);
  }

  return postIdForInsert;
}

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

export async function verifySpotPost(postId: string) {
  const normalizedId = normalizePostId(postId);

  if (!normalizedId) {
    return { ok: false as const, error: "Invalid Spot." };
  }

  const { data, error } = await supabase
    .from("posts")
    .select("id, content_kind")
    .eq("id", postIdForQuery(normalizedId))
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: error.message || "Unable to load Spot." };
  }

  if (!data) {
    return { ok: false as const, error: "Spot not found." };
  }

  if (data.content_kind !== "spot") {
    return { ok: false as const, error: "Only Spots can be shared." };
  }

  return { ok: true as const, postId: normalizedId, error: null as string | null };
}

export async function sendSpotToRecipient(input: {
  senderId: string;
  postId: string;
  recipientId: string;
}): Promise<{ error: string | null }> {
  if (input.senderId === input.recipientId) {
    return { error: "You cannot send a Spot to yourself." };
  }

  let postIdForInsert: string | number;

  try {
    postIdForInsert = requireSpotDirectMessagePostId(input.postId);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : MISSING_SPOT_POST_ID_ERROR;
    console.error(message);
    return { error: message };
  }

  console.info(`SEND_SPOT_CLICKED postId=${String(postIdForInsert)}`);

  const verified = await verifySpotPost(String(postIdForInsert));

  if (!verified.ok) {
    return { error: verified.error };
  }

  const ensured = await ensureConversationForOutgoingMessage(input.senderId, input.recipientId);

  if (ensured.sendBlockedReason) {
    return { error: ensured.sendBlockedReason };
  }

  if (ensured.error && !ensured.conversation) {
    return { error: ensured.error };
  }

  const createdAt = new Date().toISOString();

  if (
    postIdForInsert === null ||
    postIdForInsert === undefined ||
    String(postIdForInsert).trim() === ""
  ) {
    console.error(MISSING_SPOT_POST_ID_ERROR);
    return { error: MISSING_SPOT_POST_ID_ERROR };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      message_type: "spot",
      post_id: postIdForInsert,
      body: null,
      created_at: createdAt,
    })
    .select("id")
    .single();

  if (insertError) {
    return { error: insertError.message || "Unable to send Spot." };
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

export async function sendSpotToRecipients(input: {
  senderId: string;
  postId: string;
  recipientIds: string[];
}): Promise<{ sentCount: number; error: string | null }> {
  const recipients = uniqueRecipientIds(input.senderId, input.recipientIds);

  if (recipients.length === 0) {
    return { sentCount: 0, error: "Choose at least one recipient." };
  }

  let sentCount = 0;
  let lastError: string | null = null;

  for (const recipientId of recipients) {
    const result = await sendSpotToRecipient({
      senderId: input.senderId,
      postId: input.postId,
      recipientId,
    });

    if (result.error) {
      lastError = result.error;
      continue;
    }

    sentCount += 1;
  }

  if (sentCount === 0) {
    return { sentCount: 0, error: lastError ?? "Unable to send Spot." };
  }

  return {
    sentCount,
    error: sentCount < recipients.length ? lastError : null,
  };
}

export { DM_INSERT_SELECT };
