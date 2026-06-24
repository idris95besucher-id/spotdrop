import type { RealtimeChannel } from "@supabase/supabase-js";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import {
  fetchNewDirectMessagesForThread,
  normalizeDirectMessageRow,
  type DirectMessageRow,
} from "@/lib/directConversations";
import { supabase } from "@/lib/supabaseClient";

type DirectMessagePayload = DirectMessageRow;

export type DmAppendSource = "realtime-incoming" | "realtime-outgoing" | "fallback";

export type DmThreadSyncHandlers = {
  onAppendMessage: (message: DirectMessageRow, source: DmAppendSource) => void;
  onUpdateMessage: (message: DirectMessageRow) => void;
  getLatestCreatedAt: () => string | null;
  hasMessageId: (messageId: string) => boolean;
  rememberMessageId: (messageId: string) => void;
};

function logRealtimeStatus(label: string, status: string) {
  console.log(`[DM realtime] status ${status}`, { channel: label });
}

function shouldStartFallback(status: string) {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED";
}

export function startDmThreadLiveSync(
  currentUserId: string,
  partnerId: string,
  handlers: DmThreadSyncHandlers
): () => void {
  const subscriptionReady = { incoming: false, outgoing: false };
  let fallbackInterval: ReturnType<typeof setInterval> | null = null;
  let safetyInterval: ReturnType<typeof setInterval> | null = null;
  let subscribeWatchdog: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const channels: RealtimeChannel[] = [];

  const isRealtimeReady = () => subscriptionReady.incoming && subscriptionReady.outgoing;

  const handleInsert = (incoming: DirectMessagePayload, source: DmAppendSource) => {
    const normalized = normalizeDirectMessageRow(incoming);

    if (handlers.hasMessageId(normalized.id)) {
      return;
    }

    if (source === "realtime-incoming") {
      console.log("[DM realtime] INSERT incoming", {
        id: normalized.id,
        senderId: normalized.sender_id,
        partnerId,
      });
    }

    handlers.rememberMessageId(normalized.id);
    handlers.onAppendMessage(normalized, source);
  };

  const pollForNewMessages = async () => {
    if (disposed) {
      return;
    }

    const afterCreatedAt = handlers.getLatestCreatedAt();
    const { messages, error } = await fetchNewDirectMessagesForThread(
      currentUserId,
      partnerId,
      afterCreatedAt
    );

    if (error) {
      console.error("[DM fallback] poll failed", error);
      return;
    }

    const unseen = messages.filter((message) => !handlers.hasMessageId(message.id));

    if (unseen.length === 0) {
      return;
    }

    console.log("[DM fallback] fetched new messages count", unseen.length);

    for (const message of unseen) {
      handlers.rememberMessageId(message.id);
      handlers.onAppendMessage(message, "fallback");
    }
  };

  const startFallbackPolling = (intervalMs: number) => {
    if (fallbackInterval) {
      return;
    }

    console.log("[DM fallback] polling started", { intervalMs, realtimeReady: isRealtimeReady() });
    void pollForNewMessages();
    fallbackInterval = setInterval(() => {
      void pollForNewMessages();
    }, intervalMs);
  };

  console.log("[DM realtime] subscribe start", { channel: "incoming", currentUserId, partnerId });

  const incomingChannel = supabase
    .channel(`dm_thread_in_${currentUserId}_${partnerId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `recipient_id=eq.${currentUserId}`,
      },
      (payload) => {
        const incoming = payload.new as DirectMessagePayload;

        if (incoming.sender_id !== partnerId) {
          return;
        }

        handleInsert(incoming, "realtime-incoming");
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "direct_messages",
        filter: `recipient_id=eq.${currentUserId}`,
      },
      (payload) => {
        const updated = normalizeDirectMessageRow(payload.new as DirectMessagePayload);

        if (updated.sender_id !== partnerId) {
          return;
        }

        handlers.onUpdateMessage(updated);
      }
    )
    .subscribe((status) => {
      logRealtimeStatus("incoming", status);

      if (status === "SUBSCRIBED") {
        subscriptionReady.incoming = true;
      } else if (status === "CLOSED") {
        subscriptionReady.incoming = false;
      }

      if (shouldStartFallback(status)) {
        startFallbackPolling(2000);
      }
    });

  channels.push(incomingChannel);

  console.log("[DM realtime] subscribe start", { channel: "outgoing", currentUserId, partnerId });

  const outgoingChannel = supabase
    .channel(`dm_thread_out_${currentUserId}_${partnerId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `sender_id=eq.${currentUserId}`,
      },
      (payload) => {
        const incoming = payload.new as DirectMessagePayload;

        if (incoming.recipient_id !== partnerId) {
          return;
        }

        console.log("[DM realtime] INSERT outgoing", { id: incoming.id, partnerId });
        handleInsert(incoming, "realtime-outgoing");
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "direct_messages",
        filter: `sender_id=eq.${currentUserId}`,
      },
      (payload) => {
        const updated = normalizeDirectMessageRow(payload.new as DirectMessagePayload);

        if (updated.recipient_id !== partnerId) {
          return;
        }

        handlers.onUpdateMessage(updated);
      }
    )
    .subscribe((status) => {
      logRealtimeStatus("outgoing", status);

      if (status === "SUBSCRIBED") {
        subscriptionReady.outgoing = true;
      } else if (status === "CLOSED") {
        subscriptionReady.outgoing = false;
      }

      if (shouldStartFallback(status)) {
        startFallbackPolling(2000);
      }
    });

  channels.push(outgoingChannel);

  subscribeWatchdog = setTimeout(() => {
    if (disposed) {
      return;
    }

    if (!isRealtimeReady()) {
      console.warn("[DM fallback] realtime not SUBSCRIBED within 3s — starting 2s poll", {
        incoming: subscriptionReady.incoming,
        outgoing: subscriptionReady.outgoing,
      });
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
