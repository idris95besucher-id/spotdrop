import {
  CHATS_INBOX_REFRESH_EVENT,
  type InboxItem,
} from "@/lib/chatsInbox";
import type { DirectMessageType } from "@/lib/directConversations";
import {
  countUnreadDirectMessagesForPartner,
  formatUnreadBadge,
  markDirectMessagesDeliveredFromSender,
  markDirectMessagesReadInThread,
} from "@/lib/chatNotifications";
import { markRoomAsRead } from "@/lib/roomMemberships";

export const CHATS_INBOX_OPTIMISTIC_READ_EVENT = "spotdrop:chats-inbox-optimistic-read";
export const CHATS_INBOX_DM_INCOMING_EVENT = "spotdrop:chats-inbox-dm-incoming";
export const CHATS_INBOX_ROOM_INCOMING_EVENT = "spotdrop:chats-inbox-room-incoming";
export const DM_THREAD_READ_EVENT = "spotdrop:dm-thread-read";

export type OptimisticInboxReadDetail =
  | { kind: "dm"; partnerId: string }
  | { kind: "room"; countrySlug: string; citySlug: string };

export type DmIncomingMessagePreview = {
  body: string | null;
  message_type: string | null;
  spot_share_id: string | null;
  post_id: string | null;
  created_at: string;
};

export type DmIncomingDetail = {
  partnerId: string;
  message: DmIncomingMessagePreview;
};

export type RoomIncomingDetail = {
  countrySlug: string;
  citySlug: string;
  message: {
    content: string | null;
    created_at: string;
  };
  incrementUnread: boolean;
};

export type DmThreadReadDetail = {
  partnerId: string;
  clearedCount: number;
};

const optimisticDmPartners = new Set<string>();
const optimisticRoomKeys = new Set<string>();

export function roomUnreadKey(countrySlug: string, citySlug: string) {
  return `${countrySlug}/${citySlug}`;
}

export function getOptimisticReadExcludes() {
  return {
    dmPartners: optimisticDmPartners,
    roomKeys: optimisticRoomKeys,
  };
}

export type OptimisticReadExcludes = ReturnType<typeof getOptimisticReadExcludes>;

export function registerOptimisticDmRead(partnerId: string) {
  if (!partnerId) {
    return;
  }

  optimisticDmPartners.add(partnerId);
}

export function releaseOptimisticDmRead(partnerId: string) {
  optimisticDmPartners.delete(partnerId);
}

export function registerOptimisticRoomRead(countrySlug: string, citySlug: string) {
  if (!countrySlug || !citySlug) {
    return;
  }

  optimisticRoomKeys.add(roomUnreadKey(countrySlug, citySlug));
}

export function releaseOptimisticRoomRead(countrySlug: string, citySlug: string) {
  optimisticRoomKeys.delete(roomUnreadKey(countrySlug, citySlug));
}

export function dispatchOptimisticInboxRead(detail: OptimisticInboxReadDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CHATS_INBOX_OPTIMISTIC_READ_EVENT, { detail }));
}

export function dispatchDmIncomingMessage(partnerId: string, message: DmIncomingMessagePreview) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(CHATS_INBOX_DM_INCOMING_EVENT, {
      detail: { partnerId, message } satisfies DmIncomingDetail,
    })
  );
}

export function dispatchRoomIncomingMessage(detail: RoomIncomingDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CHATS_INBOX_ROOM_INCOMING_EVENT, { detail }));
}

export function dispatchDmThreadRead(detail: DmThreadReadDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(DM_THREAD_READ_EVENT, { detail }));
}

export function patchInboxItemsOptimistically(
  items: InboxItem[],
  detail: OptimisticInboxReadDetail
): InboxItem[] {
  if (detail.kind === "dm") {
    return items.map((item) => {
      if (item.kind !== "dm" || item.chat.partnerId !== detail.partnerId) {
        return item;
      }

      return {
        ...item,
        chat: {
          ...item.chat,
          unreadCount: 0,
          unreadBadge: null,
        },
      };
    });
  }

  return items.map((item) => {
    if (
      item.kind !== "room" ||
      item.room.countrySlug !== detail.countrySlug ||
      item.room.citySlug !== detail.citySlug
    ) {
      return item;
    }

    return {
      ...item,
      room: {
        ...item.room,
        unreadCount: 0,
        unreadBadge: null,
      },
    };
  });
}

export function patchInboxItemsForIncomingDm(
  items: InboxItem[],
  detail: DmIncomingDetail
): { items: InboxItem[]; partnerFound: boolean } {
  let partnerFound = false;

  const patched = items.map((item) => {
    if (item.kind !== "dm" || item.chat.partnerId !== detail.partnerId) {
      return item;
    }

    partnerFound = true;
    const unreadCount = item.chat.unreadCount + 1;

    return {
      ...item,
      chat: {
        ...item.chat,
        lastMessage: {
          body: detail.message.body,
          message_type: (detail.message.message_type ?? "text") as DirectMessageType,
          spot_share_id: detail.message.spot_share_id,
          post_id: detail.message.post_id,
        },
        lastAt: detail.message.created_at,
        unreadCount,
        unreadBadge: formatUnreadBadge(unreadCount),
      },
    };
  });

  if (!partnerFound) {
    return { items, partnerFound: false };
  }

  // Deliberately NOT re-sorted here: a live incoming message updates that row's preview/unread
  // badge in place, but must not reshuffle the list out from under someone who's mid-scroll.
  // The list re-settles into recency order on the next natural full reload (background silent
  // refresh, or reopening the page) via loadChatsInbox's own sort — never as a side effect of
  // just receiving a message while the inbox happens to be open.
  return { items: patched, partnerFound: true };
}

export function patchInboxItemsForIncomingRoom(
  items: InboxItem[],
  detail: RoomIncomingDetail
): { items: InboxItem[]; roomFound: boolean } {
  let roomFound = false;

  const patched = items.map((item) => {
    if (
      item.kind !== "room" ||
      item.room.countrySlug !== detail.countrySlug ||
      item.room.citySlug !== detail.citySlug
    ) {
      return item;
    }

    roomFound = true;
    const unreadCount = detail.incrementUnread ? item.room.unreadCount + 1 : item.room.unreadCount;

    return {
      ...item,
      room: {
        ...item.room,
        lastMessageContent: detail.message.content,
        lastAt: detail.message.created_at,
        unreadCount,
        unreadBadge: formatUnreadBadge(unreadCount),
      },
    };
  });

  if (!roomFound) {
    return { items, roomFound: false };
  }

  // Same reasoning as patchInboxItemsForIncomingDm above: update in place, don't reorder live.
  return { items: patched, roomFound: true };
}

export async function markDmThreadOpened(
  recipientId: string,
  partnerId: string,
  refreshUnreadCount: () => Promise<void>
) {
  if (!recipientId || !partnerId || recipientId === partnerId) {
    return { error: null as string | null, clearedCount: 0 };
  }

  console.log("[DM read] thread opened userId=", partnerId);

  const { count: unreadBefore, error: countError } = await countUnreadDirectMessagesForPartner(
    recipientId,
    partnerId
  );

  console.log("[DM read] unread before clear=", unreadBefore);

  if (countError) {
    console.error("[DM read] unread count failed", countError);
  }

  registerOptimisticDmRead(partnerId);
  dispatchOptimisticInboxRead({ kind: "dm", partnerId });

  await markDirectMessagesDeliveredFromSender(recipientId, partnerId);

  const readResult = await markDirectMessagesReadInThread(recipientId, partnerId);

  // Always drop the optimistic exclude before the authoritative recount. Refreshing
  // while the partner is still excluded can report 0 even when read_at never persisted.
  releaseOptimisticDmRead(partnerId);

  if (readResult.error) {
    console.error("[DM read] mark read failed", readResult.error);
    await refreshUnreadCount();
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    return { error: readResult.error, clearedCount: 0 };
  }

  const { count: unreadAfter, error: afterError } = await countUnreadDirectMessagesForPartner(
    recipientId,
    partnerId
  );

  if (afterError || (unreadAfter ?? 0) > 0) {
    console.error("[DM read] unread remains after mark-read", { unreadAfter, afterError });
    await refreshUnreadCount();
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    return { error: "Unable to mark messages as read.", clearedCount: 0 };
  }

  const clearedCount =
    readResult.updatedCount > 0 ? readResult.updatedCount : unreadBefore;

  console.log("[DM read] clearedCount=", clearedCount, "unreadAfter=", unreadAfter);

  if (clearedCount > 0) {
    dispatchDmThreadRead({ partnerId, clearedCount });
    console.log("[DM read] row badge cleared=", partnerId);
  }

  await refreshUnreadCount();
  window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));

  return { error: null as string | null, clearedCount };
}

export async function markRoomThreadOpened(
  userId: string,
  countrySlug: string,
  citySlug: string,
  refreshUnreadCount: () => Promise<void>
) {
  if (!userId || !countrySlug || !citySlug) {
    return { error: null as string | null };
  }

  registerOptimisticRoomRead(countrySlug, citySlug);
  dispatchOptimisticInboxRead({ kind: "room", countrySlug, citySlug });
  await refreshUnreadCount();

  const readResult = await markRoomAsRead(userId, countrySlug, citySlug);

  if (readResult.error) {
    releaseOptimisticRoomRead(countrySlug, citySlug);
    await refreshUnreadCount();
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    return readResult;
  }

  releaseOptimisticRoomRead(countrySlug, citySlug);
  await refreshUnreadCount();
  window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  return readResult;
}
