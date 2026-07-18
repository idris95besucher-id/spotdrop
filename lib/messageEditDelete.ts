import {
  DIRECT_MESSAGE_SELECT,
  normalizeDirectMessageRow,
  type DirectMessageRow,
} from "@/lib/directConversations";
import { CITY_MESSAGE_SELECT, type CityMessageRawRow } from "@/lib/cityMessageRow";
import { MESSAGE_SELECT as GROUP_MESSAGE_SELECT, type GroupChatMessageRow } from "@/lib/groupChatMessages";
import { supabase } from "@/lib/supabaseClient";

/**
 * Maps a raised-in-Postgres guard-trigger error to the exact English catalog string for that
 * case, so localizeUserMessage's reverse-lookup can translate it like any other error.
 */
export function mapEditDeleteError(kind: "edit" | "delete", message: string | null | undefined): string {
  const text = (message ?? "").toLowerCase();

  if (kind === "edit" && text.includes("edit window has expired")) {
    return "You can no longer edit this message.";
  }

  if (kind === "delete" && text.includes("delete window has expired")) {
    return "You can no longer delete this message.";
  }

  return kind === "delete" ? "Unable to delete this message." : "Unable to save your edit.";
}

export async function editDmMessage(input: {
  messageId: string;
  senderId: string;
  body: string;
}): Promise<{ message: DirectMessageRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("direct_messages")
    .update({ body: input.body, edited_at: new Date().toISOString() })
    .eq("id", input.messageId)
    .eq("sender_id", input.senderId)
    .select(DIRECT_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message };
  }

  return { message: normalizeDirectMessageRow(data), error: null };
}

export async function deleteDmMessageForEveryone(input: {
  messageId: string;
  senderId: string;
}): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from("direct_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.messageId)
    .eq("sender_id", input.senderId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  // RLS silently filters non-matching rows instead of raising an error, so an update that
  // matched zero rows (wrong id, not the sender, or already gone) looks identical to success
  // unless we explicitly ask for the row back and check it came back.
  if (!data) {
    return { error: "Unable to delete this message." };
  }

  return { error: null };
}

export async function editGroupMessage(input: {
  messageId: string;
  senderId: string;
  body: string;
}): Promise<{ message: GroupChatMessageRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("group_chat_messages")
    .update({ body: input.body, edited_at: new Date().toISOString() })
    .eq("id", input.messageId)
    .eq("sender_id", input.senderId)
    .select(GROUP_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message };
  }

  return { message: data as GroupChatMessageRow, error: null };
}

export async function deleteGroupMessageForEveryone(input: {
  messageId: string;
  senderId: string;
}): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from("group_chat_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.messageId)
    .eq("sender_id", input.senderId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { error: "Unable to delete this message." };
  }

  return { error: null };
}

export async function editCityMessage(input: {
  messageId: string;
  userId: string;
  content: string;
}): Promise<{ message: CityMessageRawRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("city_messages")
    .update({ content: input.content, edited_at: new Date().toISOString() })
    .eq("id", input.messageId)
    .eq("user_id", input.userId)
    .select(CITY_MESSAGE_SELECT)
    .single();

  if (error) {
    return { message: null, error: error.message };
  }

  return { message: data as CityMessageRawRow, error: null };
}

/**
 * Hard-deletes a row from `city_messages` (the room-chat messages table; its sender/owner
 * column is `user_id`, confirmed against database/schema.sql and lib/cityMessageRow.ts — not
 * sender_id/profile_id/author_id, which don't exist on this table). Used by both city rooms and
 * country rooms, since both are rendered by the same CityRoomView/CityRoomMessageBubble against
 * this one table.
 *
 * Every failure path — a real Postgres/PostgREST error, or a "successful" request that matched
 * zero rows (which is how RLS silently rejects an UPDATE/DELETE that fails its USING clause,
 * with no error at all) — is logged in full *before* any generic string is ever returned to the
 * caller, so the real reason is always in the console, never just "Unable to delete this
 * message."
 */
export async function deleteCityMessageForEveryone(input: {
  messageId: string;
  userId: string;
}): Promise<{ error: string | null }> {
  const table = "city_messages";
  const senderColumn = "user_id";

  const { data, error, status, statusText } = await supabase
    .from(table)
    .delete()
    .eq("id", input.messageId)
    .eq(senderColumn, input.userId)
    .select("id, user_id, city_id, created_at");

  if (error) {
    console.error("[deleteCityMessageForEveryone] Supabase delete failed", {
      table,
      senderColumn,
      messageId: input.messageId,
      currentUserId: input.userId,
      status,
      statusText,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return { error: error.message };
  }

  if (!data || data.length === 0) {
    // No error was raised, but nothing was deleted — this is RLS filtering the row out of the
    // DELETE's own WHERE-equivalent USING clause, not a "successful no-op". Look the row up
    // (SELECT is allowed for any authenticated user on this table) purely to log who actually
    // owns it, so a permission mismatch vs. a stale/already-gone id are never conflated.
    const { data: existingRow, error: lookupError } = await supabase
      .from(table)
      .select("id, user_id, city_id, created_at, deleted_at")
      .eq("id", input.messageId)
      .maybeSingle();

    console.error("[deleteCityMessageForEveryone] delete matched zero rows (permission/ownership failure)", {
      table,
      senderColumn,
      messageId: input.messageId,
      currentUserId: input.userId,
      rowSenderId: existingRow?.user_id ?? null,
      rowExists: Boolean(existingRow),
      lookupError: lookupError?.message ?? null,
    });

    return { error: "Unable to delete this message." };
  }

  return { error: null };
}
