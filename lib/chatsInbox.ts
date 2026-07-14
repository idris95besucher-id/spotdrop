import {
  buildFirstMessageByPartner,
  buildLatestMessageByPartner,
  getConversationPartnerId,
  getDirectMessagePartnerId,
  isIncomingRequest,
  loadDistinctMessagePartnerIds,
  loadMessagesForPartners,
  loadUserDirectConversations,
  syncMissingConversationForPartner,
  type DirectConversation,
  type DirectMessageRow,
} from "@/lib/directConversations";

export type ChatPreviewMessage = Pick<
  DirectMessageRow,
  "body" | "message_type" | "spot_share_id" | "post_id"
>;
import { loadDmInboxPreferences } from "@/lib/chatInboxPreferences";
import { formatUnreadBadge, markAllPendingDirectMessagesDelivered } from "@/lib/chatNotifications";
import { getOptimisticReadExcludes, roomUnreadKey } from "@/lib/chatUnreadSync";
import type { MessageRequestItemData } from "@/components/MessageRequestItem";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { loadRoomInbox, type RoomInboxRow } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

export const CHATS_INBOX_REFRESH_EVENT = "spotdrop:chats-inbox-refresh";
export const CHATS_INBOX_SILENT_REFRESH_EVENT = "spotdrop:chats-inbox-silent-refresh";

const INBOX_CACHE_TTL_MS = 30 * 1000;

type InboxLoadResult = {
  chats: InboxChatRow[];
  rooms: RoomInboxRow[];
  items: InboxItem[];
  requests: MessageRequestItemData[];
  error: string | null;
};

let inboxCache: { userId: string; result: InboxLoadResult; cachedAt: number } | null = null;

export function getCachedChatsInbox(userId: string): InboxLoadResult | null {
  if (!inboxCache || inboxCache.userId !== userId) {
    return null;
  }

  if (Date.now() - inboxCache.cachedAt > INBOX_CACHE_TTL_MS) {
    inboxCache = null;
    return null;
  }

  return inboxCache.result;
}

export function invalidateChatsInboxCache(userId?: string) {
  if (!inboxCache) {
    return;
  }

  if (!userId || inboxCache.userId === userId) {
    inboxCache = null;
  }
}

function setCachedChatsInbox(userId: string, result: InboxLoadResult) {
  inboxCache = { userId, result, cachedAt: Date.now() };
}

export type InboxChatRow = {
  partnerId: string;
  conversationId: string | null;
  username: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  lastMessage: ChatPreviewMessage | null;
  lastAt: string;
  unreadCount: number;
  unreadBadge: string | null;
  isMuted: boolean;
};

export type InboxItem =
  | { kind: "dm"; chat: InboxChatRow }
  | { kind: "room"; room: RoomInboxRow };

type PartnerProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  last_seen_at?: string | null;
};

async function loadProfilesByIds(partnerIds: string[]): Promise<{
  profiles: Map<string, PartnerProfile>;
  error: string | null;
}> {
  if (partnerIds.length === 0) {
    return { profiles: new Map<string, PartnerProfile>(), error: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, last_seen_at")
    .in("id", partnerIds);

  if (error) {
    return { profiles: new Map<string, PartnerProfile>(), error: error.message };
  }

  const profiles = new Map<string, PartnerProfile>();

  for (const row of data ?? []) {
    profiles.set(row.id, row as PartnerProfile);
  }

  return { profiles, error: null };
}

function resolveInboxPartnerId(
  userId: string,
  conversation: DirectConversation,
  latestMessage: DirectMessageRow | null | undefined
) {
  const messagePartnerId = latestMessage ? getDirectMessagePartnerId(latestMessage, userId) : null;

  if (messagePartnerId) {
    return messagePartnerId;
  }

  return getConversationPartnerId(conversation, userId);
}

async function countUnreadByPartner(userId: string, excludedPartners?: ReadonlySet<string>) {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("sender_id")
    .eq("recipient_id", userId)
    .is("read_at", null)
    .neq("sender_id", userId);

  if (error) {
    return new Map<string, number>();
  }

  const counts = new Map<string, number>();

  for (const row of data ?? []) {
    const senderId = String(row.sender_id);

    if (excludedPartners?.has(senderId)) {
      continue;
    }

    counts.set(senderId, (counts.get(senderId) ?? 0) + 1);
  }

  return counts;
}

function conversationByPartnerId(conversations: DirectConversation[], userId: string) {
  const map = new Map<string, DirectConversation>();

  for (const row of conversations) {
    const partnerId = getConversationPartnerId(row, userId);

    if (partnerId) {
      map.set(partnerId, row);
    }
  }

  return map;
}

export async function loadChatsInbox(userId: string) {
  invalidateChatsInboxCache(userId);

  const [{ conversations, error: conversationsError }, messagePartnerIds] = await Promise.all([
    loadUserDirectConversations(userId),
    loadDistinctMessagePartnerIds(userId),
  ]);

  if (conversationsError) {
    return {
      chats: [] as InboxChatRow[],
      rooms: [] as RoomInboxRow[],
      items: [] as InboxItem[],
      requests: [] as MessageRequestItemData[],
      error: conversationsError,
    };
  }

  let resolvedConversations = conversations;

  const missingPartnerIds = messagePartnerIds.filter(
    (partnerId) => !resolvedConversations.some((row) => getConversationPartnerId(row, userId) === partnerId)
  );

  if (missingPartnerIds.length > 0) {
    await Promise.all(missingPartnerIds.map((partnerId) => syncMissingConversationForPartner(userId, partnerId)));

    const refreshed = await loadUserDirectConversations(userId);

    if (!refreshed.error) {
      resolvedConversations = refreshed.conversations;
    }
  }

  const conversationMap = conversationByPartnerId(resolvedConversations, userId);
  const allPartnerIds = [
    ...new Set([
      ...messagePartnerIds,
      ...resolvedConversations
        .map((row) => getConversationPartnerId(row, userId))
        .filter((partnerId): partnerId is string => Boolean(partnerId)),
    ]),
  ];

  const { dmPartners, roomKeys } = getOptimisticReadExcludes();

  const [
    { messages, error: messagesError },
    ,
    unreadByPartner,
    { preferences: dmPreferences, error: preferencesError },
    { profiles, error: profilesError },
    { rooms, error: roomsError },
  ] = await Promise.all([
    loadMessagesForPartners(userId, allPartnerIds),
    markAllPendingDirectMessagesDelivered(userId),
    countUnreadByPartner(userId, dmPartners),
    loadDmInboxPreferences(userId),
    loadProfilesByIds(allPartnerIds),
    loadRoomInbox(userId),
  ]);

  if (messagesError) {
    return { chats: [], rooms: [], items: [], requests: [], error: messagesError };
  }

  if (preferencesError) {
    console.error("[chats-inbox] failed to load DM preferences:", preferencesError);
  }

  if (profilesError) {
    return { chats: [], rooms: [], items: [], requests: [], error: profilesError };
  }

  const latestByPartner = buildLatestMessageByPartner(messages, userId);
  const firstByPartner = buildFirstMessageByPartner(messages, userId);

  const chats: InboxChatRow[] = [];
  const requests: MessageRequestItemData[] = [];

  for (const row of resolvedConversations) {
    const conversationPartnerId = getConversationPartnerId(row, userId);
    const threadLatest = conversationPartnerId ? latestByPartner.get(conversationPartnerId) : undefined;
    const partnerId = resolveInboxPartnerId(userId, row, threadLatest);

    if (!partnerId) {
      continue;
    }

    const profile = profiles.get(partnerId);

    if (profile && isGuideAccountUsername(profile.username)) {
      continue;
    }

    if (isIncomingRequest(row, userId)) {
      const firstMessage = firstByPartner.get(partnerId);
      const requestLatest = latestByPartner.get(partnerId);

      requests.push({
        conversationId: row.id,
        partnerId,
        username: publicProfileUsername(profile?.username),
        avatarUrl: profile?.avatar_url ?? null,
        previewMessage: firstMessage ?? requestLatest ?? null,
        requestedAt: firstMessage?.created_at ?? requestLatest?.created_at ?? row.created_at,
      });
      continue;
    }

    if (row.status !== "accepted") {
      continue;
    }

    const preference = dmPreferences.get(partnerId);

    if (preference?.hidden) {
      continue;
    }

    const latest = latestByPartner.get(partnerId) ?? threadLatest ?? null;
    const isMuted = preference?.muted ?? false;
    const unreadCount = dmPartners.has(partnerId) ? 0 : (unreadByPartner.get(partnerId) ?? 0);

    chats.push({
      partnerId,
      conversationId: row.id,
      username: publicProfileUsername(profile?.username),
      avatarUrl: profile?.avatar_url ?? null,
      lastSeenAt: profile?.last_seen_at ?? null,
      lastMessage: latest ?? null,
      lastAt: latest?.created_at ?? row.updated_at,
      unreadCount,
      unreadBadge: formatUnreadBadge(unreadCount),
      isMuted,
    });
  }

  for (const messagePartnerId of messagePartnerIds) {
    if (!messagePartnerId || messagePartnerId === userId) {
      continue;
    }

    if (conversationMap.has(messagePartnerId)) {
      continue;
    }

    const preference = dmPreferences.get(messagePartnerId);

    if (preference?.hidden) {
      continue;
    }

    const profile = profiles.get(messagePartnerId);

    if (profile && isGuideAccountUsername(profile.username)) {
      continue;
    }

    const latest = latestByPartner.get(messagePartnerId);

    if (!latest) {
      continue;
    }

    const partnerId = getDirectMessagePartnerId(latest, userId) ?? messagePartnerId;

    if (!partnerId || partnerId === userId) {
      continue;
    }

    const isMuted = preference?.muted ?? false;
    const unreadCount = dmPartners.has(partnerId) ? 0 : (unreadByPartner.get(partnerId) ?? 0);

    chats.push({
      partnerId,
      conversationId: null,
      username: publicProfileUsername(profile?.username),
      avatarUrl: profile?.avatar_url ?? null,
      lastSeenAt: profile?.last_seen_at ?? null,
      lastMessage: latest,
      lastAt: latest.created_at,
      unreadCount,
      unreadBadge: formatUnreadBadge(unreadCount),
      isMuted,
    });
  }

  chats.sort((left, right) => new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime());
  requests.sort((left, right) => new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime());

  if (roomsError) {
    console.error("[chats-inbox] room inbox unavailable:", roomsError);
  }

  const patchedRooms = (rooms ?? []).map((room) => {
    if (roomKeys.has(roomUnreadKey(room.countrySlug, room.citySlug))) {
      return {
        ...room,
        unreadCount: 0,
        unreadBadge: null,
      };
    }

    return room;
  });

  const items: InboxItem[] = [
    ...chats.map((chat) => ({ kind: "dm" as const, chat })),
    ...patchedRooms.map((room) => ({ kind: "room" as const, room })),
  ];

  items.sort((left, right) => {
    const leftAt =
      left.kind === "dm" ? left.chat.lastAt : left.room.lastAt;
    const rightAt =
      right.kind === "dm" ? right.chat.lastAt : right.room.lastAt;

    return new Date(rightAt).getTime() - new Date(leftAt).getTime();
  });

  const result = { chats, rooms, items, requests, error: null as string | null };
  setCachedChatsInbox(userId, result);
  return result;
}
