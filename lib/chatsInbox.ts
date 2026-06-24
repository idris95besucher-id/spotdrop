export const CHATS_INBOX_REFRESH_EVENT = "spotdrop:chats-inbox-refresh";
export const CHATS_INBOX_SILENT_REFRESH_EVENT = "spotdrop:chats-inbox-silent-refresh";

import {
  buildFirstMessageByPartner,
  buildLatestMessageByPartner,
  getConversationPartnerId,
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

export type InboxChatRow = {
  partnerId: string;
  conversationId: string | null;
  username: string;
  avatarUrl: string | null;
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
    .select("id, username, avatar_url")
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
    map.set(getConversationPartnerId(row, userId), row);
  }

  return map;
}

export async function loadChatsInbox(userId: string) {
  let { conversations, error: conversationsError } = await loadUserDirectConversations(userId);

  if (conversationsError) {
    return {
      chats: [] as InboxChatRow[],
      rooms: [] as RoomInboxRow[],
      items: [] as InboxItem[],
      requests: [] as MessageRequestItemData[],
      error: conversationsError,
    };
  }

  const messagePartnerIds = await loadDistinctMessagePartnerIds(userId);

  for (const partnerId of messagePartnerIds) {
    const existing = conversations.find((row) => getConversationPartnerId(row, userId) === partnerId);

    if (!existing) {
      await syncMissingConversationForPartner(userId, partnerId);
    }
  }

  if (messagePartnerIds.length > 0) {
    const refreshed = await loadUserDirectConversations(userId);

    if (!refreshed.error) {
      conversations = refreshed.conversations;
    }
  }

  const conversationMap = conversationByPartnerId(conversations, userId);
  const allPartnerIds = [
    ...new Set([...messagePartnerIds, ...conversations.map((row) => getConversationPartnerId(row, userId))]),
  ];

  const { messages, error: messagesError } = await loadMessagesForPartners(userId, allPartnerIds);

  if (messagesError) {
    return { chats: [], rooms: [], items: [], requests: [], error: messagesError };
  }

  const latestByPartner = buildLatestMessageByPartner(messages, userId);
  const firstByPartner = buildFirstMessageByPartner(messages, userId);
  await markAllPendingDirectMessagesDelivered(userId);
  const { dmPartners, roomKeys } = getOptimisticReadExcludes();
  const unreadByPartner = await countUnreadByPartner(userId, dmPartners);

  const { preferences: dmPreferences, error: preferencesError } = await loadDmInboxPreferences(userId);

  if (preferencesError) {
    console.error("[chats-inbox] failed to load DM preferences:", preferencesError);
  }

  const { profiles, error: profilesError } = await loadProfilesByIds(allPartnerIds);

  if (profilesError) {
    return { chats: [], rooms: [], items: [], requests: [], error: profilesError };
  }

  const chats: InboxChatRow[] = [];
  const requests: MessageRequestItemData[] = [];

  for (const row of conversations) {
    const partnerId = getConversationPartnerId(row, userId);
    const profile = profiles.get(partnerId);

    if (profile && isGuideAccountUsername(profile.username)) {
      continue;
    }

    if (isIncomingRequest(row, userId)) {
      const firstMessage = firstByPartner.get(partnerId);
      const latest = latestByPartner.get(partnerId);

      requests.push({
        conversationId: row.id,
        partnerId,
        username: publicProfileUsername(profile?.username),
        avatarUrl: profile?.avatar_url ?? null,
        previewMessage: firstMessage ?? latest ?? null,
        requestedAt: firstMessage?.created_at ?? latest?.created_at ?? row.created_at,
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

    const latest = latestByPartner.get(partnerId);
    const isMuted = preference?.muted ?? false;
    const unreadCount = dmPartners.has(partnerId) ? 0 : (unreadByPartner.get(partnerId) ?? 0);

    chats.push({
      partnerId,
      conversationId: row.id,
      username: publicProfileUsername(profile?.username),
      avatarUrl: profile?.avatar_url ?? null,
      lastMessage: latest ?? null,
      lastAt: latest?.created_at ?? row.updated_at,
      unreadCount,
      unreadBadge: formatUnreadBadge(unreadCount),
      isMuted,
    });
  }

  for (const partnerId of messagePartnerIds) {
    if (conversationMap.has(partnerId)) {
      continue;
    }

    const preference = dmPreferences.get(partnerId);

    if (preference?.hidden) {
      continue;
    }

    const profile = profiles.get(partnerId);

    if (profile && isGuideAccountUsername(profile.username)) {
      continue;
    }

    const latest = latestByPartner.get(partnerId);

    if (!latest) {
      continue;
    }

    const isMuted = preference?.muted ?? false;
    const unreadCount = dmPartners.has(partnerId) ? 0 : (unreadByPartner.get(partnerId) ?? 0);

    chats.push({
      partnerId,
      conversationId: null,
      username: publicProfileUsername(profile?.username),
      avatarUrl: profile?.avatar_url ?? null,
      lastMessage: latest,
      lastAt: latest.created_at,
      unreadCount,
      unreadBadge: formatUnreadBadge(unreadCount),
      isMuted,
    });
  }

  chats.sort((left, right) => new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime());
  requests.sort((left, right) => new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime());

  const { rooms, error: roomsError } = await loadRoomInbox(userId);

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

  return { chats, rooms, items, requests, error: null as string | null };
}
