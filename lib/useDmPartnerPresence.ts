"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchPartnerProfilePresenceDirect,
  PRESENCE_DM_DISPLAY_TICK_MS,
  type DmPartnerPresenceStatus,
} from "@/lib/userPresence";
import { useUserOnlineStatus } from "@/lib/useUserOnlineStatus";
import { supabase } from "@/lib/supabaseClient";

/** DM header partner presence — Realtime Presence + fresh last_seen_at (90s). */
export function useDmPartnerPresence(
  partnerId: string | null,
  partnerUsername?: string | null
): DmPartnerPresenceStatus {
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [rawIsOnline, setRawIsOnline] = useState<boolean | null>(null);
  const lastSeenAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!partnerId) {
      setLastSeenAt(null);
      setRawIsOnline(null);
      lastSeenAtRef.current = null;
      return;
    }

    let cancelled = false;

    const applyProfileRow = (
      nextLastSeenAt: string | null,
      nextRawIsOnline: boolean | null,
      reason: string
    ) => {
      if (cancelled) {
        return;
      }

      lastSeenAtRef.current = nextLastSeenAt;
      setLastSeenAt(nextLastSeenAt);
      setRawIsOnline(nextRawIsOnline);

      console.log("[Online] partner status updated", {
        partnerId,
        lastSeenAt: nextLastSeenAt,
        rawIsOnline: nextRawIsOnline,
        reason,
      });
    };

    const loadProfileStatus = async (reason: string) => {
      const result = await fetchPartnerProfilePresenceDirect(partnerId, partnerUsername);

      if (cancelled) {
        return;
      }

      if (result.error) {
        console.error("[Online] DM partner profile load failed", {
          partnerId,
          partnerUsername: partnerUsername ?? null,
          error: result.error,
          reason,
        });
        return;
      }

      applyProfileRow(result.lastSeenAt, result.rawIsOnline ?? null, reason);
    };

    void loadProfileStatus("initial");

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadProfileStatus("visible");
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    const profileChannel = supabase
      .channel(`profile_presence:${partnerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${partnerId}`,
        },
        (payload) => {
          const row = payload.new as {
            last_seen_at?: string | null;
            is_online?: boolean | null;
          };

          if (row.last_seen_at !== undefined || row.is_online !== undefined) {
            applyProfileRow(
              row.last_seen_at ?? lastSeenAtRef.current,
              row.is_online ?? null,
              "postgres_changes"
            );
          }
        }
      )
      .subscribe();

    const pollTimer = window.setInterval(() => {
      void loadProfileStatus("poll");
    }, PRESENCE_DM_DISPLAY_TICK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(profileChannel);
    };
  }, [partnerId, partnerUsername]);

  const isOnline = useUserOnlineStatus(partnerId, lastSeenAt, {
    screen: "dm-header",
    username: partnerUsername,
    rawIsOnline,
  });

  return {
    userId: partnerId,
    username: partnerUsername ?? null,
    rawIsOnline,
    isOnline,
    lastSeenAt,
  };
}
