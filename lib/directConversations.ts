import { loadFollowRelationship } from "@/lib/follows";
import {
  checkCanMessageUser,
  type MessagePrivacyBlockReasonKey,
} from "@/lib/messagePrivacy";
import { isProfileUserId } from "@/lib/userPresence";
import { supabase } from "@/lib/supabaseClient";
import { isLocationCardShareMessage } from "@/lib/locationCardShareMessage";
import { toUserFacingError } from "@/lib/userFacingError";

const MESSAGE_PRIVACY_BLOCK_EN: Record<MessagePrivacyBlockReasonKey, string> = {
  "messagePrivacy.blocked.nobody": "This user isn't accepting messages.",
  "messagePrivacy.blocked.followers": "Only followers can message this user.",
  "messagePrivacy.blocked.friends": "Only friends can message this user.",
};

export type ConversationStatus = "pending" | "accepted" | "declined" | "blocked";

export type DirectConversation = {
  id: string;
  user_one_id: string;
  user_two_id: string;
  status: ConversationStatus;
  requested_by: string;
  created_at: string;
  updated_at: string;
};

export type DirectMessageType = "text" | "spot_share_request" | "spot_share_accepted" | "spot";

export type DirectMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  message_type: DirectMessageType;
  spot_share_id: string | null;
  post_id: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
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

type DirectMessageRowInput = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body?: string | null;
  message_type?: string | null;
  spot_share_id?: string | null;
  post_id?: string | null;
  created_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
  audio_url?: string | null;
  audio_duration_seconds?: number | null;
  audio_waveform?: number[] | null;
  image_url?: string | null;
  live_location_lat?: number | null;
  live_location_lng?: number | null;
  live_location_updated_at?: string | null;
  live_location_expires_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

/** Exported so every DM sender (voice/photo/location/text) selects the exact same column set — no drift. */
export const DIRECT_MESSAGE_SELECT =
  "id, sender_id, recipient_id, body, message_type, spot_share_id, post_id, created_at, delivered_at, read_at, audio_url, audio_duration_seconds, audio_waveform, image_url, live_location_lat, live_location_lng, live_location_updated_at, live_location_expires_at, edited_at, deleted_at";

/** Normalize DB rows (handles missing message_type when spot_share_id is set). */
export function normalizeDirectMessageRow(row: DirectMessageRowInput): DirectMessageRow {
  const spotShareId = row.spot_share_id ?? null;
  const postId = row.post_id ?? null;
  let messageType = (row.message_type ?? "text") as DirectMessageType;

  if (postId && messageType !== "spot") {
    messageType = "spot";
  }

  if (
    spotShareId &&
    messageType !== "spot_share_request" &&
    messageType !== "spot_share_accepted"
  ) {
    messageType = "spot_share_request";
  }

  return {
    id: String(row.id),
    sender_id: String(row.sender_id),
    recipient_id: String(row.recipient_id),
    body: row.body ?? null,
    message_type: messageType,
    spot_share_id: spotShareId,
    post_id: row.post_id ? String(row.post_id) : null,
    created_at: String(row.created_at),
    delivered_at: row.delivered_at ? String(row.delivered_at) : null,
    read_at: row.read_at ? String(row.read_at) : null,
    audio_url: row.audio_url ?? null,
    audio_duration_seconds: row.audio_duration_seconds ?? null,
    audio_waveform: row.audio_waveform ?? null,
    image_url: row.image_url ?? null,
    live_location_lat: row.live_location_lat ?? null,
    live_location_lng: row.live_location_lng ?? null,
    live_location_updated_at: row.live_location_updated_at ? String(row.live_location_updated_at) : null,
    live_location_expires_at: row.live_location_expires_at ? String(row.live_location_expires_at) : null,
    edited_at: row.edited_at ? String(row.edited_at) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  };
}

export function isSpotDirectMessage(message: Pick<DirectMessageRow, "message_type" | "post_id">) {
  return message.message_type === "spot" || Boolean(message.post_id);
}

export function isSpotShareDirectMessage(
  message: Pick<DirectMessageRow, "message_type" | "spot_share_id">
) {
  return (
    message.message_type === "spot_share_request" ||
    message.message_type === "spot_share_accepted" ||
    Boolean(message.spot_share_id)
  );
}

export function spotShareMessageCardType(
  message: Pick<DirectMessageRow, "message_type" | "spot_share_id">
): "spot_share_request" | "spot_share_accepted" {
  if (message.message_type === "spot_share_accepted") {
    return "spot_share_accepted";
  }

  return "spot_share_request";
}

/** Thread-scoped DM query (must filter in DB — a user-wide query hits the row limit and drops new messages). */
export async function loadDirectMessagesForThread(userId: string, partnerId: string) {
  const threadFilter = `and(sender_id.eq.${userId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${userId})`;

  const { data, error } = await supabase
    .from("direct_messages")
    .select(DIRECT_MESSAGE_SELECT)
    .or(threadFilter)
    .order("created_at", { ascending: true });

  if (error) {
    return { messages: [] as DirectMessageRow[], error: toUserFacingError(error) };
  }

  const messages = (data ?? []).map((row) => normalizeDirectMessageRow(row as DirectMessageRowInput));

  return { messages, error: null };
}

/** Fetch thread messages created after a timestamp (fallback polling). */
export async function fetchNewDirectMessagesForThread(
  userId: string,
  partnerId: string,
  afterCreatedAt: string | null
) {
  const threadFilter = `and(sender_id.eq.${userId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${userId})`;

  let query = supabase
    .from("direct_messages")
    .select(DIRECT_MESSAGE_SELECT)
    .or(threadFilter)
    .order("created_at", { ascending: true });

  if (afterCreatedAt) {
    query = query.gt("created_at", afterCreatedAt);
  }

  const { data, error } = await query;

  if (error) {
    return { messages: [] as DirectMessageRow[], error: toUserFacingError(error) };
  }

  const messages = (data ?? []).map((row) => normalizeDirectMessageRow(row as DirectMessageRowInput));

  return { messages, error: null as string | null };
}

export function normalizeConversationPair(userIdA: string, userIdB: string) {
  if (userIdA === userIdB) {
    throw new Error("Cannot create a conversation with yourself.");
  }

  return userIdA < userIdB
    ? { userOneId: userIdA, userTwoId: userIdB }
    : { userOneId: userIdB, userTwoId: userIdA };
}

export function getConversationPartnerId(conversation: DirectConversation, userId: string) {
  return getOtherParticipantId(userId, conversation.user_one_id, conversation.user_two_id);
}

export function getOtherParticipantId(
  currentUserId: string,
  participantA: string,
  participantB: string
): string | null {
  if (participantA === currentUserId && participantB !== currentUserId) {
    return participantB;
  }

  if (participantB === currentUserId && participantA !== currentUserId) {
    return participantA;
  }

  return null;
}

export function getDirectMessagePartnerId(
  message: { sender_id: string; recipient_id: string },
  currentUserId: string
) {
  return getOtherParticipantId(currentUserId, message.sender_id, message.recipient_id);
}

/** Resolve DM thread partner — never treat the signed-in user as the partner. */
export async function resolveDmThreadPartnerId(
  currentUserId: string | null,
  routeUserId: string
) {
  const route = routeUserId.trim();

  if (!currentUserId) {
    return {
      partnerId: null as string | null,
      partnerUsername: null as string | null,
      error: null as string | null,
    };
  }

  if (route && isProfileUserId(route) && route !== currentUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", route)
      .maybeSingle();

    return {
      partnerId: route,
      partnerUsername: (data?.username as string | null) ?? null,
      error: null as string | null,
    };
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .select("sender_id, recipient_id, created_at")
    .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return {
      partnerId: null as string | null,
      partnerUsername: null as string | null,
      error: toUserFacingError(error),
    };
  }

  for (const row of data ?? []) {
    const partnerId = getDirectMessagePartnerId(row, currentUserId);

    if (!partnerId) {
      continue;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", partnerId)
      .maybeSingle();

    return {
      partnerId,
      partnerUsername: (profile?.username as string | null) ?? null,
      error: null as string | null,
    };
  }

  return {
    partnerId: null as string | null,
    partnerUsername: null as string | null,
    error: null as string | null,
  };
}

export function isIncomingRequest(conversation: DirectConversation, userId: string) {
  return conversation.status === "pending" && conversation.requested_by !== userId;
}

export function canSendDirectMessage(conversation: DirectConversation | null, senderId: string) {
  if (!conversation) {
    return { allowed: true, reason: null as string | null };
  }

  if (conversation.status === "accepted") {
    return { allowed: true, reason: null };
  }

  if (conversation.status === "pending") {
    if (conversation.requested_by === senderId) {
      return { allowed: true, reason: null };
    }

    return {
      allowed: false,
      reason: "Accept this message request before you can reply.",
    };
  }

  if (conversation.status === "declined") {
    return {
      allowed: false,
      reason: "This message request was declined.",
    };
  }

  return {
    allowed: false,
    reason: "You cannot send messages in this conversation.",
  };
}

function isMissingConversationsTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    message.includes("direct_conversations") ||
    message.includes("add-direct-conversations")
  );
}

export function isConversationsMigrationRequiredMessage(message: string | null) {
  if (!message) {
    return false;
  }

  return message.toLowerCase().includes("add-direct-conversations");
}

export async function getDirectConversation(
  userId: string,
  partnerId: string
): Promise<{ conversation: DirectConversation | null; error: string | null }> {
  try {
    const { userOneId, userTwoId } = normalizeConversationPair(userId, partnerId);

    const { data, error } = await supabase
      .from("direct_conversations")
      .select("id, user_one_id, user_two_id, status, requested_by, created_at, updated_at")
      .eq("user_one_id", userOneId)
      .eq("user_two_id", userTwoId)
      .maybeSingle();

    if (error) {
      if (isMissingConversationsTable(error)) {
        return { conversation: null, error: null };
      }

      return { conversation: null, error: toUserFacingError(error) };
    }

    return { conversation: (data as DirectConversation | null) ?? null, error: null };
  } catch (caught) {
    return {
      conversation: null,
      error: caught instanceof Error ? caught.message : "Unable to load conversation.",
    };
  }
}

export async function areMutualFriends(userId: string, partnerId: string) {
  const { data, error } = await loadFollowRelationship(userId, partnerId);

  if (error || !data) {
    return false;
  }

  return data.areFriends;
}

export async function loadDistinctMessagePartnerIds(userId: string) {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("sender_id, recipient_id")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return [] as string[];
  }

  const partnerIds = new Set<string>();

  for (const row of data ?? []) {
    const partnerId = getDirectMessagePartnerId(row, userId);

    if (partnerId) {
      partnerIds.add(String(partnerId));
    }
  }

  return [...partnerIds];
}

async function getFirstMessageSenderId(userId: string, partnerId: string) {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("sender_id, created_at")
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${userId})`
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return userId;
  }

  return String(data.sender_id);
}

export async function syncMissingConversationForPartner(userId: string, partnerId: string) {
  const existing = await getDirectConversation(userId, partnerId);

  if (existing.conversation || existing.error) {
    return existing;
  }

  const friends = await areMutualFriends(userId, partnerId);
  const firstSenderId = await getFirstMessageSenderId(userId, partnerId);

  if (friends) {
    return createAcceptedConversation(firstSenderId, firstSenderId === userId ? partnerId : userId);
  }

  return createPendingConversation(firstSenderId, firstSenderId === userId ? partnerId : userId);
}

export async function touchConversationUpdatedAt(userId: string, partnerId: string) {
  const { conversation } = await getDirectConversation(userId, partnerId);

  if (!conversation) {
    return;
  }

  await supabase
    .from("direct_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
}

async function insertConversationRow(input: {
  userOneId: string;
  userTwoId: string;
  status: ConversationStatus;
  requestedBy: string;
}) {
  return supabase
    .from("direct_conversations")
    .insert({
      user_one_id: input.userOneId,
      user_two_id: input.userTwoId,
      status: input.status,
      requested_by: input.requestedBy,
    })
    .select("id, user_one_id, user_two_id, status, requested_by, created_at, updated_at")
    .single();
}

async function createConversationWithStatus(
  senderId: string,
  recipientId: string,
  status: ConversationStatus
): Promise<{ conversation: DirectConversation | null; error: string | null }> {
  const { userOneId, userTwoId } = normalizeConversationPair(senderId, recipientId);

  const { data, error } = await insertConversationRow({
    userOneId,
    userTwoId,
    status,
    requestedBy: senderId,
  });

  if (error) {
    if (error.code === "23505") {
      return getDirectConversation(senderId, recipientId);
    }

    if (isMissingConversationsTable(error)) {
      return { conversation: null, error: null };
    }

    return { conversation: null, error: toUserFacingError(error) };
  }

  return { conversation: data as DirectConversation, error: null };
}

export async function createPendingConversation(
  senderId: string,
  recipientId: string
): Promise<{ conversation: DirectConversation | null; error: string | null }> {
  return createConversationWithStatus(senderId, recipientId, "pending");
}

export async function createAcceptedConversation(
  senderId: string,
  recipientId: string
): Promise<{ conversation: DirectConversation | null; error: string | null }> {
  return createConversationWithStatus(senderId, recipientId, "accepted");
}

/** Proceed without a conversation row (legacy DB or optional table). */
function legacyConversationAllowed() {
  return {
    conversation: null,
    error: null,
    sendBlockedReason: null,
  };
}

export async function ensureConversationForOutgoingMessage(
  senderId: string,
  recipientId: string
): Promise<{
  conversation: DirectConversation | null;
  error: string | null;
  sendBlockedReason: string | null;
}> {
  const messagePermission = await checkCanMessageUser(senderId, recipientId);

  if (!messagePermission.allowed) {
    return {
      conversation: null,
      error: null,
      sendBlockedReason: messagePermission.reasonKey
        ? MESSAGE_PRIVACY_BLOCK_EN[messagePermission.reasonKey]
        : "This user is not accepting messages right now.",
    };
  }

  const existing = await getDirectConversation(senderId, recipientId);

  if (existing.error) {
    if (isMissingConversationsTable({ message: existing.error })) {
      return legacyConversationAllowed();
    }

    if (isConversationsMigrationRequiredMessage(existing.error)) {
      return legacyConversationAllowed();
    }

    return { conversation: null, error: existing.error, sendBlockedReason: existing.error };
  }

  if (!existing.conversation) {
    const friends = await areMutualFriends(senderId, recipientId);

    const created = friends
      ? await createAcceptedConversation(senderId, recipientId)
      : await createPendingConversation(senderId, recipientId);

    if (created.conversation) {
      return { conversation: created.conversation, error: null, sendBlockedReason: null };
    }

    if (created.error) {
      if (isMissingConversationsTable({ message: created.error })) {
        return legacyConversationAllowed();
      }

      return {
        conversation: null,
        error: created.error,
        sendBlockedReason: created.error,
      };
    }

    // Table missing or conversations optional — still allow DMs / spot shares
    return legacyConversationAllowed();
  }

  const sendCheck = canSendDirectMessage(existing.conversation, senderId);

  return {
    conversation: existing.conversation,
    error: null,
    sendBlockedReason: sendCheck.allowed ? null : sendCheck.reason,
  };
}

export async function acceptConversationRequest(
  conversationId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { data: row, error: loadError } = await supabase
    .from("direct_conversations")
    .select("id, user_one_id, user_two_id, status, requested_by")
    .eq("id", conversationId)
    .maybeSingle();

  if (loadError) {
    return { error: toUserFacingError(loadError) };
  }

  if (!row) {
    return { error: "Request not found." };
  }

  const conversation = row as DirectConversation;

  if (conversation.status !== "pending") {
    return { error: "This request is no longer pending." };
  }

  if (conversation.requested_by === userId) {
    return { error: "You cannot accept your own message request." };
  }

  if (userId !== conversation.user_one_id && userId !== conversation.user_two_id) {
    return { error: "You do not have access to this request." };
  }

  const { error } = await supabase
    .from("direct_conversations")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("status", "pending")
    .neq("requested_by", userId);

  return { error: error ? toUserFacingError(error) : null };
}

export async function declineConversationRequest(
  conversationId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { data: row, error: loadError } = await supabase
    .from("direct_conversations")
    .select("id, user_one_id, user_two_id, status, requested_by")
    .eq("id", conversationId)
    .maybeSingle();

  if (loadError) {
    return { error: toUserFacingError(loadError) };
  }

  if (!row) {
    return { error: "Request not found." };
  }

  const conversation = row as DirectConversation;

  if (conversation.status !== "pending") {
    return { error: "This request is no longer pending." };
  }

  if (conversation.requested_by === userId) {
    return { error: "You cannot decline your own message request." };
  }

  if (userId !== conversation.user_one_id && userId !== conversation.user_two_id) {
    return { error: "You do not have access to this request." };
  }

  const { error } = await supabase
    .from("direct_conversations")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("status", "pending")
    .neq("requested_by", userId);

  return { error: error ? toUserFacingError(error) : null };
}

export async function loadUserDirectConversations(userId: string) {
  const { data, error } = await supabase
    .from("direct_conversations")
    .select("id, user_one_id, user_two_id, status, requested_by, created_at, updated_at")
    .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingConversationsTable(error)) {
      return { conversations: [] as DirectConversation[], error: null };
    }

    return { conversations: [] as DirectConversation[], error: toUserFacingError(error) };
  }

  return { conversations: (data ?? []) as DirectConversation[], error: null };
}

export async function loadMessagesForPartners(userId: string, partnerIds: string[]) {
  if (partnerIds.length === 0) {
    return { messages: [] as DirectMessageRow[], error: null };
  }

  const orFilters = partnerIds
    .map(
      (partnerId) =>
        `and(sender_id.eq.${userId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${userId})`
    )
    .join(",");

  const { data, error } = await supabase
    .from("direct_messages")
    .select(DIRECT_MESSAGE_SELECT)
    .or(orFilters)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return { messages: [] as DirectMessageRow[], error: toUserFacingError(error) };
  }

  return {
    messages: (data ?? []).map((row) => normalizeDirectMessageRow(row as DirectMessageRowInput)),
    error: null,
  };
}

export function buildLatestMessageByPartner(messages: DirectMessageRow[], userId: string) {
  const latest = new Map<string, DirectMessageRow>();

  for (const message of messages) {
    const partnerId = getDirectMessagePartnerId(message, userId);

    if (!partnerId || latest.has(partnerId)) {
      continue;
    }

    latest.set(partnerId, message);
  }

  return latest;
}

export function truncateChatPreview(
  message: Pick<DirectMessageRow, "body" | "message_type" | "spot_share_id" | "post_id">,
  max = 100
) {
  if (isSpotDirectMessage(message)) {
    return "Shared a Spot";
  }

  if (message.message_type === "spot_share_request" || (message.spot_share_id && message.message_type !== "spot_share_accepted")) {
    return "Sent you a CheckSpot";
  }

  if (message.message_type === "spot_share_accepted") {
    return "CheckSpot accepted";
  }

  if (isLocationCardShareMessage(message.body)) {
    return "Shared a Text Card";
  }

  const trimmed = (message.body ?? "").trim();

  if (!trimmed) {
    return "Message";
  }

  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1)}…`;
}

export async function loadLegacyChatList(userId: string) {
  const { data: messageRows, error } = await supabase
    .from("direct_messages")
    .select(DIRECT_MESSAGE_SELECT)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return { partnerIds: [] as string[], latestByPartner: new Map<string, DirectMessageRow>(), error: toUserFacingError(error) };
  }

  const messages = (messageRows ?? []).map((row) =>
    normalizeDirectMessageRow(row as DirectMessageRowInput)
  );
  const latestByPartner = buildLatestMessageByPartner(messages, userId);
  const partnerIds = [...latestByPartner.keys()];

  return { partnerIds, latestByPartner, error: null };
}

export function buildFirstMessageByPartner(messages: DirectMessageRow[], userId: string) {
  const first = new Map<string, DirectMessageRow>();

  for (const message of [...messages].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  )) {
    const partnerId = getDirectMessagePartnerId(message, userId);

    if (!partnerId || first.has(partnerId)) {
      continue;
    }

    first.set(partnerId, message);
  }

  return first;
}
