"use client";

import { useEffect, useRef, useState } from "react";
import { appPresence } from "@/lib/appPresence";
import {
  fetchPartnerProfilePresenceDirect,
  isPartnerOnlineForDm,
  PRESENCE_DM_DISPLAY_TICK_MS,
  resolveProfileIsOnline,
  type DmPartnerPresenceStatus,
} from "@/lib/userPresence";
import { supabase } from "@/lib/supabaseClient";

function readProfileOnlineFromRow(
  row: { is_online?: boolean | null; last_seen_at?: string | null },
  fallback: boolean
) {
  const nextLastSeenAt =
    row.last_seen_at !== undefined ? (row.last_seen_at ?? null) : null;
  const resolved = resolveProfileIsOnline(row.is_online, nextLastSeenAt ?? undefined);

  if (typeof row.is_online === "boolean" || nextLastSeenAt !== null) {
    return resolved;
  }

  return fallback;
}

/** Live partner presence for DM header — Realtime Presence + profiles.is_online. */
export function useDmPartnerPresence(
  partnerId: string | null,
  partnerUsername?: string | null
): DmPartnerPresenceStatus {
  const [presenceOnline, setPresenceOnline] = useState(false);
  const [profileOnline, setProfileOnline] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [presenceProfileId, setPresenceProfileId] = useState<string | null>(partnerId);
  const [displayTick, setDisplayTick] = useState(0);
  const profileOnlineRef = useRef(false);
  const lastSeenAtRef = useRef<string | null>(null);
  const profileLoadedRef = useRef(false);
  const presenceProfileIdRef = useRef<string | null>(partnerId);

  useEffect(() => {
    presenceProfileIdRef.current = presenceProfileId;
  }, [presenceProfileId]);

  useEffect(() => {
    profileOnlineRef.current = profileOnline;
  }, [profileOnline]);

  useEffect(() => {
    lastSeenAtRef.current = lastSeenAt;
  }, [lastSeenAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayTick((value) => value + 1);
    }, PRESENCE_DM_DISPLAY_TICK_MS);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    presenceProfileIdRef.current = partnerId;
    setPresenceProfileId(partnerId);
  }, [partnerId]);

  useEffect(() => {
    console.log("[Online] useDmPartnerPresence mounted", {
      partnerId,
      partnerUsername: partnerUsername ?? null,
    });

    if (!partnerId) {
      setPresenceOnline(false);
      setProfileOnline(false);
      setLastSeenAt(null);
      profileOnlineRef.current = false;
      lastSeenAtRef.current = null;
      profileLoadedRef.current = false;
      return;
    }

    let cancelled = false;

    const applyProfileSnapshot = (
      nextProfileOnline: boolean,
      nextLastSeenAt: string | null,
      reason: string,
      resolvedProfileId?: string | null
    ) => {
      if (cancelled) {
        return;
      }

      const activeProfileId = resolvedProfileId ?? presenceProfileIdRef.current ?? partnerId;

      if (resolvedProfileId && resolvedProfileId !== presenceProfileIdRef.current) {
        presenceProfileIdRef.current = resolvedProfileId;
        setPresenceProfileId(resolvedProfileId);
      }

      profileLoadedRef.current = true;
      profileOnlineRef.current = nextProfileOnline;
      lastSeenAtRef.current = nextLastSeenAt;
      setProfileOnline(nextProfileOnline);
      setLastSeenAt(nextLastSeenAt);

      console.log("[Online] DM partner presence", {
        partnerId,
        presenceProfileId: activeProfileId,
        reason,
        is_online: nextProfileOnline,
        last_seen_at: nextLastSeenAt,
        presenceOnline: appPresence.isUserOnline(activeProfileId),
        computedIsOnline: isPartnerOnlineForDm(
          appPresence.isUserOnline(activeProfileId),
          nextProfileOnline,
          nextLastSeenAt
        ),
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

      applyProfileSnapshot(
        result.isOnline,
        result.lastSeenAt,
        reason,
        result.profileId
      );
    };

    void loadProfileStatus("initial");

    void (async () => {
      try {
        await appPresence.ensureSubscribed();
      } catch (error) {
        console.error("[Online] presence subscribe failed", error);
      }

      if (!cancelled) {
        const activeProfileId = presenceProfileIdRef.current ?? partnerId;
        setPresenceOnline(appPresence.isUserOnline(activeProfileId));
        await loadProfileStatus("presence-ready");
      }
    })();

    const unsubscribePresence = appPresence.subscribe((onlineUserIds) => {
      if (cancelled) {
        return;
      }

      const activeProfileId = presenceProfileIdRef.current ?? partnerId;
      const nextPresenceOnline = onlineUserIds.has(activeProfileId);
      setPresenceOnline(nextPresenceOnline);

      console.log("[Online] DM partner presence", {
        partnerId,
        presenceProfileId: activeProfileId,
        reason: "presence",
        is_online: profileOnlineRef.current,
        last_seen_at: lastSeenAtRef.current,
        presenceOnline: nextPresenceOnline,
        computedIsOnline: isPartnerOnlineForDm(
          nextPresenceOnline,
          profileOnlineRef.current,
          lastSeenAtRef.current
        ),
      });
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadProfileStatus("visible");
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    const retryTimer = window.setTimeout(() => {
      if (!cancelled && !profileLoadedRef.current) {
        void loadProfileStatus("retry");
      }
    }, 1_500);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      unsubscribePresence();
      document.removeEventListener("visibilitychange", onVisible);
      profileLoadedRef.current = false;
    };
  }, [partnerId, partnerUsername]);

  useEffect(() => {
    if (!presenceProfileId) {
      return;
    }

    const profileChannel = supabase
      .channel(`profile_presence:${presenceProfileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${presenceProfileId}`,
        },
        (payload) => {
          const row = payload.new as { is_online?: boolean | null; last_seen_at?: string | null };
          const nextLastSeenAt =
            row.last_seen_at !== undefined
              ? (row.last_seen_at ?? null)
              : lastSeenAtRef.current;
          const nextProfileOnline = readProfileOnlineFromRow(
            row,
            profileOnlineRef.current
          );

          profileOnlineRef.current = nextProfileOnline;
          lastSeenAtRef.current = nextLastSeenAt;
          setProfileOnline(nextProfileOnline);
          setLastSeenAt(nextLastSeenAt);

          console.log("[Online] DM partner presence", {
            partnerId,
            presenceProfileId,
            reason: "postgres_changes",
            is_online: nextProfileOnline,
            last_seen_at: nextLastSeenAt,
            computedIsOnline: isPartnerOnlineForDm(
              appPresence.isUserOnline(presenceProfileId),
              nextProfileOnline,
              nextLastSeenAt
            ),
          });
        }
      )
      .subscribe((status) => {
        console.log("[Online] profile realtime status", { partnerId, presenceProfileId, status });
      });

    return () => {
      void supabase.removeChannel(profileChannel);
    };
  }, [partnerId, presenceProfileId]);

  const computedIsOnline = isPartnerOnlineForDm(presenceOnline, profileOnline, lastSeenAt);

  useEffect(() => {
    if (!partnerId) {
      return;
    }

    console.log("[Online] DM partner presence", {
      partnerId,
      presenceProfileId,
      reason: "render",
      is_online: profileOnline,
      last_seen_at: lastSeenAt,
      presenceOnline,
      computedIsOnline,
    });
  }, [
    partnerId,
    presenceProfileId,
    presenceOnline,
    profileOnline,
    lastSeenAt,
    computedIsOnline,
    displayTick,
  ]);

  return {
    isOnline: computedIsOnline,
    lastSeenAt,
  };
}
