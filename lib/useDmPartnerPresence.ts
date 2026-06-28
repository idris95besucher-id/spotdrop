"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchPartnerProfilePresenceDirect,
  isDmPartnerOnline,
  PRESENCE_DM_DISPLAY_TICK_MS,
  type DmPartnerPresenceStatus,
} from "@/lib/userPresence";
import { supabase } from "@/lib/supabaseClient";

/** DM header partner presence — last_seen_at only (online within 2 min). */
export function useDmPartnerPresence(
  partnerId: string | null,
  partnerUsername?: string | null
): DmPartnerPresenceStatus {
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [displayTick, setDisplayTick] = useState(0);
  const lastSeenAtRef = useRef<string | null>(null);
  const statusRef = useRef<{ isOnline: boolean; lastSeenAt: string | null } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayTick((value) => value + 1);
    }, PRESENCE_DM_DISPLAY_TICK_MS);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!partnerId) {
      setLastSeenAt(null);
      lastSeenAtRef.current = null;
      statusRef.current = null;
      return;
    }

    let cancelled = false;

    const publishStatus = (nextLastSeenAt: string | null, reason: string) => {
      const nextIsOnline = isDmPartnerOnline(nextLastSeenAt);
      const previous = statusRef.current;

      if (!previous) {
        console.log("[Online] partner status loaded", {
          partnerId,
          lastSeenAt: nextLastSeenAt,
          isOnline: nextIsOnline,
          reason,
        });
      } else if (
        previous.isOnline !== nextIsOnline ||
        previous.lastSeenAt !== nextLastSeenAt
      ) {
        console.log("[Online] partner status changed", {
          partnerId,
          lastSeenAt: nextLastSeenAt,
          isOnline: nextIsOnline,
          previousIsOnline: previous.isOnline,
          previousLastSeenAt: previous.lastSeenAt,
          reason,
        });
      }

      statusRef.current = { isOnline: nextIsOnline, lastSeenAt: nextLastSeenAt };
    };

    const applyLastSeenAt = (nextLastSeenAt: string | null, reason: string) => {
      if (cancelled) {
        return;
      }

      lastSeenAtRef.current = nextLastSeenAt;
      setLastSeenAt(nextLastSeenAt);
      publishStatus(nextLastSeenAt, reason);
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

      applyLastSeenAt(result.lastSeenAt, reason);
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
          const row = payload.new as { last_seen_at?: string | null };

          if (row.last_seen_at !== undefined) {
            applyLastSeenAt(row.last_seen_at ?? null, "postgres_changes");
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
      statusRef.current = null;
    };
  }, [partnerId, partnerUsername]);

  const isOnline = isDmPartnerOnline(lastSeenAt);

  useEffect(() => {
    if (!partnerId) {
      return;
    }

    const previous = statusRef.current;

    if (!previous || previous.lastSeenAt !== lastSeenAt) {
      return;
    }

    if (previous.isOnline === isOnline) {
      return;
    }

    console.log("[Online] partner status changed", {
      partnerId,
      lastSeenAt,
      isOnline,
      previousIsOnline: previous.isOnline,
      previousLastSeenAt: previous.lastSeenAt,
      reason: "display-tick",
    });

    statusRef.current = { isOnline, lastSeenAt };
  }, [partnerId, lastSeenAt, isOnline, displayTick]);

  return {
    isOnline,
    lastSeenAt,
  };
}
