import { formatUnreadBadge } from "@/lib/chatNotifications";
import { excludeGuideProfiles, publicProfileUsername, sanitizePublicProfiles } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export const GROUP_CHAT_PHOTOS_BUCKET = "group-chat-photos" as const;
export const GROUP_NAME_MAX_LENGTH = 80;

/** Keep in sync with CHATS_INBOX_REFRESH_EVENT in chatsInbox.ts (avoid circular import — chatsInbox.ts imports from this file). */
const GROUP_INBOX_CHANGED_EVENT = "spotdrop:chats-inbox-refresh";

function notifyGroupInboxChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(GROUP_INBOX_CHANGED_EVENT));
}

export type GroupRole = "owner" | "moderator" | "member";

export type GroupChatSummary = {
  id: string;
  name: string;
  photoUrl: string | null;
  ownerId: string;
  role: GroupRole;
  memberCount: number;
  lastMessage: string | null;
  lastMessageType: "text" | "system" | null;
  lastSenderId: string | null;
  lastAt: string;
  unreadCount: number;
  unreadBadge: string | null;
};

export type GroupChatDetails = {
  id: string;
  name: string;
  photoUrl: string | null;
  ownerId: string;
  createdBy: string;
  createdAt: string;
};

export type GroupChatMember = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  joinedAt: string;
  username: string;
  avatarUrl: string | null;
  isVerified: boolean | null;
};

type GroupInboxRpcRow = {
  group_id: string;
  name: string;
  photo_url: string | null;
  owner_id: string;
  role: GroupRole;
  member_count: number;
  last_message: string | null;
  last_message_type: "text" | "system" | null;
  last_sender_id: string | null;
  last_message_at: string;
  unread_count: number;
};

type SupabaseErrorShape = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
} | null;

/**
 * Logs the *full* Postgres/PostgREST error (message, code, details, hint) — visible in
 * Safari Web Inspector / Xcode console — so failures never disappear behind a generic
 * UI message. See lib/groupChatErrors.ts for why group chats skip the usual sanitizer.
 */
function logGroupError(context: string, error: SupabaseErrorShape) {
  if (!error) {
    return;
  }

  console.error(`[group-chats] ${context} failed`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

function isMissingGroupChatsSchema(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    message.includes("group_chat") ||
    (message.includes("function") && message.includes("schema cache"))
  );
}

function mapGroupInboxRow(row: GroupInboxRpcRow): GroupChatSummary {
  const unreadCount = row.unread_count ?? 0;

  return {
    id: row.group_id,
    name: row.name,
    photoUrl: row.photo_url,
    ownerId: row.owner_id,
    role: row.role,
    memberCount: row.member_count ?? 0,
    lastMessage: row.last_message,
    lastMessageType: row.last_message_type,
    lastSenderId: row.last_sender_id,
    lastAt: row.last_message_at,
    unreadCount,
    unreadBadge: formatUnreadBadge(unreadCount),
  };
}

export async function loadGroupInbox(userId: string): Promise<{ groups: GroupChatSummary[]; error: string | null }> {
  const { data, error } = await supabase.rpc("get_user_group_inbox", { p_user_id: userId });

  if (error) {
    // Always log the full error first — the "is this just an unapplied migration" check
    // below only controls whether we surface a user-facing error string, never whether
    // we log, since real backend errors can otherwise be discarded silently.
    logGroupError("get_user_group_inbox", error);

    if (isMissingGroupChatsSchema(error)) {
      return { groups: [], error: null };
    }

    return { groups: [], error: error.message };
  }

  return { groups: ((data ?? []) as GroupInboxRpcRow[]).map(mapGroupInboxRow), error: null };
}

export async function loadGroupChat(groupId: string): Promise<{ group: GroupChatDetails | null; error: string | null }> {
  const { data, error } = await supabase
    .from("group_chats")
    .select("id, name, photo_url, owner_id, created_by, created_at")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    logGroupError("load group_chats row", error);
    return { group: null, error: error.message };
  }

  if (!data) {
    return { group: null, error: null };
  }

  return {
    group: {
      id: data.id,
      name: data.name,
      photoUrl: data.photo_url,
      ownerId: data.owner_id,
      createdBy: data.created_by,
      createdAt: data.created_at,
    },
    error: null,
  };
}

export async function loadGroupMembers(
  groupId: string
): Promise<{ members: GroupChatMember[]; error: string | null }> {
  const { data: memberRows, error: membersError } = await supabase
    .from("group_chat_members")
    .select("id, group_id, user_id, role, joined_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  if (membersError) {
    logGroupError("load group_chat_members", membersError);
    return { members: [], error: membersError.message };
  }

  const rows = memberRows ?? [];

  if (rows.length === 0) {
    return { members: [], error: null };
  }

  const userIds = rows.map((row) => row.user_id);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, is_verified")
    .in("id", userIds);

  if (profilesError) {
    logGroupError("load member profiles", profilesError);
    return { members: [], error: profilesError.message };
  }

  const profileById = new Map(
    sanitizePublicProfiles(excludeGuideProfiles(profiles ?? [])).map((profile) => [profile.id, profile])
  );

  const members: GroupChatMember[] = rows.map((row) => {
    const profile = profileById.get(row.user_id);

    return {
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      role: row.role as GroupRole,
      joinedAt: row.joined_at,
      username: publicProfileUsername(profile?.username),
      avatarUrl: profile?.avatar_url ?? null,
      isVerified: profile?.is_verified ?? null,
    };
  });

  const roleWeight: Record<GroupRole, number> = { owner: 0, moderator: 1, member: 2 };
  members.sort((left, right) => roleWeight[left.role] - roleWeight[right.role]);

  return { members, error: null };
}

function formatGroupPhotoPath(groupId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
  return `${groupId}/photo-${Date.now()}.${safeExtension}`;
}

export async function uploadGroupPhoto(groupId: string, file: File): Promise<{ url: string | null; error: string | null }> {
  if (!file.type.startsWith("image/")) {
    return { url: null, error: "Only image files are allowed." };
  }

  const path = formatGroupPhotoPath(groupId, file);
  const { error: uploadError } = await supabase.storage.from(GROUP_CHAT_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });

  if (uploadError) {
    logGroupError("upload group photo", uploadError);
    return { url: null, error: uploadError.message || "Unable to upload group photo." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(GROUP_CHAT_PHOTOS_BUCKET).getPublicUrl(path);

  return { url: publicUrl, error: null };
}

/** Logs the full Postgres error and returns its real `message` (not sanitized — see lib/groupChatErrors.ts). */
function rpcErrorMessage(context: string, error: SupabaseErrorShape, fallback: string) {
  if (!error) {
    return null;
  }

  logGroupError(context, error);
  return error.message || fallback;
}

export async function createGroupChat(input: {
  name: string;
  memberIds: string[];
  photoFile?: File | null;
}): Promise<{ groupId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_group_chat", {
    p_name: input.name,
    p_photo_url: null,
    p_member_ids: input.memberIds,
  });

  if (error) {
    return { groupId: null, error: rpcErrorMessage("create_group_chat", error, "Unable to create the group.") };
  }

  const groupId = data as string;

  // The group (and its owner membership + first system message) already exists in the
  // database at this point — notify the inbox now so it doesn't wait on the photo upload
  // below, and so /chats picks it up even though this call happens off the /chats page.
  notifyGroupInboxChanged();

  if (input.photoFile) {
    const uploaded = await uploadGroupPhoto(groupId, input.photoFile);

    if (uploaded.url) {
      const { error: photoError } = await supabase.rpc("update_group_photo", {
        p_group_id: groupId,
        p_photo_url: uploaded.url,
      });

      if (photoError) {
        // The group itself was created successfully — don't fail the whole flow over the photo.
        logGroupError("update_group_photo (post-create)", photoError);
      }
    }
  }

  return { groupId, error: null };
}

export async function addGroupMembers(groupId: string, memberIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("add_group_members", { p_group_id: groupId, p_member_ids: memberIds });
  return { error: rpcErrorMessage("add_group_members", error, "Unable to add members.") };
}

export async function removeGroupMember(groupId: string, memberId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("remove_group_member", { p_group_id: groupId, p_member_id: memberId });
  return { error: rpcErrorMessage("remove_group_member", error, "Unable to remove member.") };
}

export async function leaveGroupChat(groupId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("leave_group_chat", { p_group_id: groupId });
  return { error: rpcErrorMessage("leave_group_chat", error, "Unable to leave the group.") };
}

export async function promoteGroupModerator(groupId: string, memberId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("promote_group_moderator", { p_group_id: groupId, p_member_id: memberId });
  return { error: rpcErrorMessage("promote_group_moderator", error, "Unable to promote member.") };
}

export async function demoteGroupModerator(groupId: string, memberId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("demote_group_moderator", { p_group_id: groupId, p_member_id: memberId });
  return { error: rpcErrorMessage("demote_group_moderator", error, "Unable to demote moderator.") };
}

export async function transferGroupOwnership(groupId: string, newOwnerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("transfer_group_ownership", {
    p_group_id: groupId,
    p_new_owner_id: newOwnerId,
  });
  return { error: rpcErrorMessage("transfer_group_ownership", error, "Unable to transfer ownership.") };
}

export async function deleteGroupChat(groupId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("delete_group_chat", { p_group_id: groupId });
  return { error: rpcErrorMessage("delete_group_chat", error, "Unable to delete the group.") };
}

export async function renameGroupChat(groupId: string, name: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("rename_group_chat", { p_group_id: groupId, p_name: name });
  return { error: rpcErrorMessage("rename_group_chat", error, "Unable to rename the group.") };
}

export async function updateGroupPhoto(groupId: string, file: File): Promise<{ url: string | null; error: string | null }> {
  const uploaded = await uploadGroupPhoto(groupId, file);

  if (uploaded.error || !uploaded.url) {
    return { url: null, error: uploaded.error };
  }

  const { error } = await supabase.rpc("update_group_photo", { p_group_id: groupId, p_photo_url: uploaded.url });

  if (error) {
    return { url: null, error: rpcErrorMessage("update_group_photo", error, "Unable to update the group photo.") };
  }

  return { url: uploaded.url, error: null };
}

export async function markGroupThreadRead(groupId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("group_chat_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) {
    logGroupError("mark group thread read", error);
    return { error: error.message };
  }

  return { error: null };
}
