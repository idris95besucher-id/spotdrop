"use client";

import { useEffect, useMemo, useState } from "react";
import { appPresence } from "@/lib/appPresence";
import {
  isOnlineNow,
  PRESENCE_DM_DISPLAY_TICK_MS,
  type IsOnlineNowInput,
} from "@/lib/userPresence";

type UseUserOnlineStatusMeta = Pick<
  IsOnlineNowInput,
  "screen" | "username" | "rawIsOnline" | "isOnlineFlag"
>;

/** Shared client hook — Realtime Presence + fresh last_seen_at (90s). */
export function useUserOnlineStatus(
  userId: string | null | undefined,
  lastSeenAt: string | null | undefined,
  meta: UseUserOnlineStatusMeta
) {
  const [presenceOnline, setPresenceOnline] = useState(() =>
    userId ? appPresence.isUserOnline(userId) : false
  );
  const [displayTick, setDisplayTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      setPresenceOnline(false);
      return;
    }

    void appPresence.ensureSubscribed();

    return appPresence.subscribe((onlineUserIds) => {
      setPresenceOnline(onlineUserIds.has(userId));
    });
  }, [userId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDisplayTick((value) => value + 1);
    }, PRESENCE_DM_DISPLAY_TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return useMemo(
    () =>
      isOnlineNow({
        screen: meta.screen,
        userId,
        username: meta.username,
        isOnlineFlag: meta.isOnlineFlag ?? meta.rawIsOnline,
        lastSeenAt,
        presenceOnline,
      }),
    [
      displayTick,
      lastSeenAt,
      meta.isOnlineFlag,
      meta.rawIsOnline,
      meta.screen,
      meta.username,
      presenceOnline,
      userId,
    ]
  );
}
