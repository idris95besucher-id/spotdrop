import type { RealtimeChannel } from "@supabase/supabase-js";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import { fetchNewGroupMessagesForThread, type GroupChatMessageRow } from "@/lib/groupChatMessages";
import { supabase } from "@/lib/supabaseClient";

export type GroupAppendSource = "realtime" | "fallback";

export type GroupChatSyncHandlers = {
  onAppendMessage: (message: GroupChatMessageRow, source: GroupAppendSource) => void;
  getLatestCreatedAt: () => string | null;
  hasMessageId: (messageId: string) => boolean;
  rememberMessageId: (messageId: string) => void;
  /** Fired when the current user's own membership row is deleted (removed or left elsewhere). */
  onRemovedFromGroup: () => void;
  /** Fired on any membership change in this group (add/remove/role change) — refresh member list. */
  onMembersChanged: () => void;
  /** Fired when the group_chats row itself changes (rename, photo, ownership transfer). */
  onGroupUpdated: () => void;
};

function shouldStartFallback(status: string) {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED";
}

export function startGroupThreadLiveSync(
  groupId: string,
  currentUserId: string,
  handlers: GroupChatSyncHandlers
): () => void {
  let subscribed = false;
  let fallbackInterval: ReturnType<typeof setInterval> | null = null;
  let safetyInterval: ReturnType<typeof setInterval> | null = null;
  let subscribeWatchdog: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const channels: RealtimeChannel[] = [];

  const handleInsert = (incoming: GroupChatMessageRow, source: GroupAppendSource) => {
    if (handlers.hasMessageId(incoming.id)) {
      return;
    }

    handlers.rememberMessageId(incoming.id);
    handlers.onAppendMessage(incoming, source);
  };

  const pollForNewMessages = async () => {
    if (disposed) {
      return;
    }

    const afterCreatedAt = handlers.getLatestCreatedAt();
    const { messages, error } = await fetchNewGroupMessagesForThread(groupId, afterCreatedAt);

    if (error) {
      console.error("[group fallback] poll failed", error);
      return;
    }

    const unseen = messages.filter((message) => !handlers.hasMessageId(message.id));

    for (const message of unseen) {
      handlers.rememberMessageId(message.id);
      handlers.onAppendMessage(message, "fallback");
    }
  };

  const startFallbackPolling = (intervalMs: number) => {
    if (fallbackInterval) {
      return;
    }

    console.log("[group fallback] polling started", { intervalMs, groupId });
    void pollForNewMessages();
    fallbackInterval = setInterval(() => {
      void pollForNewMessages();
    }, intervalMs);
  };

  const messagesChannel = supabase
    .channel(`group_thread_messages_${groupId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "group_chat_messages", filter: `group_id=eq.${groupId}` },
      (payload) => {
        handleInsert(payload.new as GroupChatMessageRow, "realtime");
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
      } else if (status === "CLOSED") {
        subscribed = false;
      }

      if (shouldStartFallback(status)) {
        startFallbackPolling(2000);
      }
    });

  channels.push(messagesChannel);

  const membersChannel = supabase
    .channel(`group_thread_members_${groupId}_${currentUserId}`)
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "group_chat_members", filter: `user_id=eq.${currentUserId}` },
      (payload) => {
        const old = payload.old as { group_id?: string };

        if (old?.group_id === groupId) {
          handlers.onRemovedFromGroup();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_chat_members", filter: `group_id=eq.${groupId}` },
      () => {
        handlers.onMembersChanged();
      }
    )
    .subscribe();

  channels.push(membersChannel);

  const groupChannel = supabase
    .channel(`group_thread_group_${groupId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "group_chats", filter: `id=eq.${groupId}` },
      () => {
        handlers.onGroupUpdated();
      }
    )
    .subscribe();

  channels.push(groupChannel);

  subscribeWatchdog = setTimeout(() => {
    if (disposed) {
      return;
    }

    if (!subscribed) {
      console.warn("[group fallback] realtime not SUBSCRIBED within 3s — starting 2s poll");
      startFallbackPolling(2000);
    }
  }, 3000);

  if (isCapacitorNative()) {
    safetyInterval = setInterval(() => {
      void pollForNewMessages();
    }, 5000);
  }

  return () => {
    disposed = true;

    if (subscribeWatchdog) {
      clearTimeout(subscribeWatchdog);
    }

    if (fallbackInterval) {
      clearInterval(fallbackInterval);
    }

    if (safetyInterval) {
      clearInterval(safetyInterval);
    }

    for (const channel of channels) {
      void supabase.removeChannel(channel);
    }
  };
}
