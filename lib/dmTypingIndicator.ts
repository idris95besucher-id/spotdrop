import type { RealtimeChannel } from "@supabase/supabase-js";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export const TYPING_HIDE_MS = 3000;
export const TYPING_SEND_THROTTLE_MS = 800;
export const TYPING_EVENT = "typing";

export type TypingBroadcastPayload = {
  userId: string;
  username: string;
};

export function dmTypingChannelName(userIdA: string, userIdB: string) {
  return `dm_typing_${[userIdA, userIdB].sort().join("_")}`;
}

export type StartDmTypingSyncOptions = {
  currentUserId: string;
  partnerId: string;
  username: string;
  onPartnerTyping: (username: string) => void;
  onPartnerStopped: () => void;
};

export type DmTypingSyncHandle = {
  signalTyping: () => void;
  stop: () => void;
};

function parseTypingPayload(raw: unknown): TypingBroadcastPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const envelope = raw as Record<string, unknown>;
  const inner =
    envelope.payload && typeof envelope.payload === "object"
      ? (envelope.payload as Record<string, unknown>)
      : envelope;

  const userId = typeof inner.userId === "string" ? inner.userId : "";
  const username = typeof inner.username === "string" ? inner.username : "";

  if (!userId) {
    return null;
  }

  return { userId, username };
}

export function startDmTypingSync(options: StartDmTypingSyncOptions): DmTypingSyncHandle {
  const { currentUserId, partnerId, username, onPartnerTyping, onPartnerStopped } = options;

  const channelName = dmTypingChannelName(currentUserId, partnerId);
  console.log("[Typing] channel =", channelName);

  let disposed = false;
  let subscribed = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSend = false;
  let lastSendAt = 0;

  const clearHideTimer = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hideIndicator = () => {
    console.log("[Typing] hide");
    onPartnerStopped();
  };

  const showIndicator = (rawUsername: string) => {
    const displayName = publicProfileUsername(rawUsername || "Someone");
    console.log("[Typing] show", { username: displayName });
    onPartnerTyping(displayName);

    clearHideTimer();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hideIndicator();
    }, TYPING_HIDE_MS);
  };

  const channel: RealtimeChannel = supabase.channel(channelName, {
    config: {
      broadcast: { self: false },
    },
  });

  channel.on("broadcast", { event: TYPING_EVENT }, (message) => {
    const payload = parseTypingPayload(message);

    if (!payload) {
      return;
    }

    console.log("[Typing] received", payload);

    if (payload.userId === currentUserId) {
      return;
    }

    if (payload.userId !== partnerId) {
      return;
    }

    showIndicator(payload.username);
  });

  void channel.subscribe((status) => {
    console.log("[Typing] status =", status);

    if (status === "SUBSCRIBED") {
      subscribed = true;

      if (pendingSend) {
        pendingSend = false;
        void sendTyping();
      }

      return;
    }

    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      subscribed = false;
    }
  });

  const sendTyping = async () => {
    if (disposed || !subscribed) {
      return;
    }

    const payload: TypingBroadcastPayload = {
      userId: currentUserId,
      username,
    };

    console.log("[Typing] send", payload);

    await channel.send({
      type: "broadcast",
      event: TYPING_EVENT,
      payload,
    });

    lastSendAt = Date.now();
  };

  const signalTyping = () => {
    if (disposed) {
      return;
    }

    if (!subscribed) {
      pendingSend = true;
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSendAt;

    if (elapsed >= TYPING_SEND_THROTTLE_MS) {
      void sendTyping();
      return;
    }

    if (throttleTimer) {
      return;
    }

    throttleTimer = setTimeout(() => {
      throttleTimer = null;

      if (!disposed) {
        void sendTyping();
      }
    }, TYPING_SEND_THROTTLE_MS - elapsed);
  };

  const stop = () => {
    disposed = true;
    clearHideTimer();

    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }

    void supabase.removeChannel(channel);
  };

  return { signalTyping, stop };
};
