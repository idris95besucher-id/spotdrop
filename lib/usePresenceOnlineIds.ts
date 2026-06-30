"use client";

import { useEffect, useState } from "react";
import { appPresence } from "@/lib/appPresence";
import { PRESENCE_DM_DISPLAY_TICK_MS } from "@/lib/userPresence";

/** Realtime Presence online user ids, re-evaluated on a timer for last_seen freshness. */
export function usePresenceOnlineIds() {
  const [presenceOnlineIds, setPresenceOnlineIds] = useState<ReadonlySet<string>>(() => new Set());
  const [freshnessTick, setFreshnessTick] = useState(0);

  useEffect(() => {
    void appPresence.ensureSubscribed();
    return appPresence.subscribe(setPresenceOnlineIds);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFreshnessTick((value) => value + 1);
    }, PRESENCE_DM_DISPLAY_TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return { presenceOnlineIds, freshnessTick };
}
