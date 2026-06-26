import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export const APP_PRESENCE_CHANNEL = "app_online";

type PresenceListener = (onlineUserIds: ReadonlySet<string>) => void;

function readOnlineUserIds(channel: RealtimeChannel) {
  return new Set(Object.keys(channel.presenceState()));
}

function isTerminalChannelStatus(status: string) {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED";
}

class AppPresenceManager {
  private channel: RealtimeChannel | null = null;
  private connectPromise: Promise<void> | null = null;
  private subscribed = false;
  private trackingUserId: string | null = null;
  private isTracking = false;
  private onlineUserIds = new Set<string>();
  private listeners = new Set<PresenceListener>();

  private notify() {
    const snapshot = new Set(this.onlineUserIds);

    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }

  private applyPresenceState(reason: string) {
    if (!this.channel) {
      return;
    }

    this.onlineUserIds = readOnlineUserIds(this.channel);
    console.log("[Online] presence sync", {
      reason,
      onlineUserIds: Array.from(this.onlineUserIds),
      trackingUserId: this.trackingUserId,
    });
    this.notify();
  }

  private attachPresenceListeners(channel: RealtimeChannel) {
    channel
      .on("presence", { event: "sync" }, () => {
        this.applyPresenceState("sync");
      })
      .on("presence", { event: "join" }, () => {
        this.applyPresenceState("join");
      })
      .on("presence", { event: "leave" }, () => {
        this.applyPresenceState("leave");
      });
  }

  private waitForSubscribe(channel: RealtimeChannel) {
    if (this.subscribed && this.channel === channel) {
      return Promise.resolve();
    }

    if (this.connectPromise && this.channel === channel) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        console.log("[Online] presence channel status", status);

        if (status === "SUBSCRIBED") {
          this.subscribed = true;
          this.applyPresenceState("subscribed");
          resolve();
          return;
        }

        if (isTerminalChannelStatus(status)) {
          this.subscribed = false;
          reject(new Error(`Presence channel ${status}`));
        }
      });
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  subscribe(listener: PresenceListener) {
    this.listeners.add(listener);
    listener(new Set(this.onlineUserIds));

    return () => {
      this.listeners.delete(listener);
    };
  }

  isUserOnline(userId: string) {
    return this.onlineUserIds.has(userId);
  }

  /** Subscribe to the shared presence channel (does not track). */
  async ensureSubscribed() {
    if (this.channel && this.subscribed) {
      return;
    }

    if (this.channel && this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.channel = supabase.channel(APP_PRESENCE_CHANNEL);
    this.attachPresenceListeners(this.channel);
    await this.waitForSubscribe(this.channel);
  }

  private async createTrackingChannel(userId: string) {
    if (this.channel) {
      try {
        if (this.isTracking) {
          await this.channel.untrack();
        }
      } catch {
        /* ignore */
      }

      void supabase.removeChannel(this.channel);
      this.channel = null;
      this.subscribed = false;
      this.isTracking = false;
    }

    this.channel = supabase.channel(APP_PRESENCE_CHANNEL, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    this.attachPresenceListeners(this.channel);
    await this.waitForSubscribe(this.channel);
  }

  async startTracking(userId: string) {
    if (this.trackingUserId === userId && this.isTracking && this.subscribed) {
      return;
    }

    await this.createTrackingChannel(userId);

    if (!this.channel) {
      throw new Error("Presence channel missing after connect");
    }

    const trackResult = await this.channel.track({
      online_at: Date.now(),
      user_id: userId,
    });

    if (trackResult !== "ok") {
      console.warn("[Online] presence track failed", { userId, trackResult });
      return;
    }

    this.trackingUserId = userId;
    this.isTracking = true;
    this.applyPresenceState("track");
  }

  /** Stop broadcasting presence but keep the channel subscribed for observers. */
  async untrack() {
    if (!this.channel || !this.isTracking) {
      this.trackingUserId = null;
      this.isTracking = false;
      return;
    }

    try {
      await this.channel.untrack();
    } catch {
      /* ignore */
    }

    this.trackingUserId = null;
    this.isTracking = false;
    this.applyPresenceState("untrack");
  }

  async destroy() {
    await this.untrack();

    if (this.channel) {
      void supabase.removeChannel(this.channel);
    }

    this.channel = null;
    this.subscribed = false;
    this.connectPromise = null;
    this.onlineUserIds = new Set();
    this.notify();
  }
}

export const appPresence = new AppPresenceManager();

export async function syncRealtimeAuth(accessToken: string | null | undefined) {
  if (!accessToken) {
    return;
  }

  await supabase.realtime.setAuth(accessToken);
}
