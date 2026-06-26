"use client";

import { useEffect, useState } from "react";
import { fetchUserLastSeenAt, isUserOnline, PRESENCE_HEARTBEAT_MS } from "@/lib/userPresence";

export function useUserPresence(userId: string | null, pollMs = PRESENCE_HEARTBEAT_MS) {
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLastSeenAt(null);
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      const { lastSeenAt: next, error } = await fetchUserLastSeenAt(userId);

      if (cancelled) {
        return;
      }

      if (!error) {
        setLastSeenAt(next);
      }
    };

    void refresh();

    const interval = setInterval(() => {
      void refresh();
    }, pollMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollMs, userId]);

  return {
    lastSeenAt,
    isOnline: isUserOnline(lastSeenAt),
  };
}
