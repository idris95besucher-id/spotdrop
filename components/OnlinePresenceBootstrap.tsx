"use client";

import { useEffect, useRef } from "react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { appPresence, syncRealtimeAuth } from "@/lib/appPresence";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_SAFE_OFFLINE_MS,
  setUserOffline,
  setUserOnline,
} from "@/lib/userPresence";
import { supabase } from "@/lib/supabaseClient";

/** Keeps profiles.is_online / last_seen_at in sync while the authenticated app is active. */
type OnlinePresenceBootstrapProps = {
  /** Root auth user id — same source as PushNotificationsBootstrap (works on web + Capacitor). */
  userId?: string | null;
  /** True after the first auth session read completes. */
  authReady?: boolean;
};

export default function OnlinePresenceBootstrap({
  userId: userIdProp,
  authReady: authReadyProp,
}: OnlinePresenceBootstrapProps = {}) {
  const { session, loading: authLoading } = useAuthSession();
  const authReady = authReadyProp ?? !authLoading;
  const userId = userIdProp !== undefined ? userIdProp : (session?.user?.id ?? null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const effectGenerationRef = useRef(0);
  const heartbeatRunningRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);
  const safeOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeAppActiveRef = useRef(true);

  useEffect(() => {
    if (!authReady || !userId) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncRealtimeAuth(nextSession?.access_token);
    });

    void supabase.auth.getSession().then(({ data }) => {
      void syncRealtimeAuth(data.session?.access_token);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [authReady, userId]);

  useEffect(() => {
    const effectGeneration = ++effectGenerationRef.current;

    console.log("[Online] bootstrap effect START", {
      effectGeneration,
      authReady,
      userId,
      platform: isCapacitorNative() ? "capacitor-native" : "web",
    });

    if (!authReady) {
      console.log("[Online] bootstrap effect waiting for auth session", { effectGeneration });
      return () => {
        console.log("[Online] bootstrap effect CLEANUP", {
          effectGeneration,
          reason: "auth-loading",
        });
      };
    }

    const previousUserId = previousUserIdRef.current;

    if (previousUserId && previousUserId !== userId) {
      console.log("[Online] bootstrap user changed", {
        fromUserId: previousUserId,
        toUserId: userId,
      });
      void setUserOffline(previousUserId, "bootstrap-user-changed");
      void appPresence.destroy();
    }

    previousUserIdRef.current = userId;

    if (!userId) {
      console.log("[Online] bootstrap effect skipped — no authenticated userId", { effectGeneration });
      activeUserIdRef.current = null;
      return () => {
        console.log("[Online] bootstrap effect CLEANUP", {
          effectGeneration,
          reason: "no-user",
        });
      };
    }

    let cancelled = false;
    activeUserIdRef.current = userId;

    const isAppActive = () => {
      if (isCapacitorNative()) {
        return nativeAppActiveRef.current;
      }

      return document.visibilityState === "visible";
    };

    const cancelSafeOffline = (source: string) => {
      if (!safeOfflineTimerRef.current) {
        return;
      }

      clearTimeout(safeOfflineTimerRef.current);
      safeOfflineTimerRef.current = null;
      console.log("[Online] safe offline timeout cancelled", {
        userId,
        source,
        lifecycleGeneration: lifecycleGenerationRef.current,
      });
    };

    const goOnline = async (capturedGeneration: number, source: string) => {
      if (cancelled || activeUserIdRef.current !== userId) {
        console.log("[Online] goOnline skipped", {
          userId,
          source,
          cancelled,
          activeUserId: activeUserIdRef.current,
          capturedGeneration,
        });
        return;
      }

      if (capturedGeneration !== lifecycleGenerationRef.current) {
        console.log("[Online] stale goOnline skipped", {
          userId,
          source,
          capturedGeneration,
          lifecycleGeneration: lifecycleGenerationRef.current,
        });
        return;
      }

      if (!isAppActive()) {
        console.log("[Online] goOnline skipped — app not active", {
          userId,
          source,
          capturedGeneration,
          nativeAppActive: nativeAppActiveRef.current,
          visibilityState: document.visibilityState,
        });
        return;
      }

      console.log("[Online] goOnline()", {
        userId,
        source,
        effectGeneration,
        lifecycleGeneration: capturedGeneration,
      });

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("[Online] goOnline session unavailable", {
          userId,
          error: sessionError.message,
        });
        return;
      }

      if (
        cancelled ||
        capturedGeneration !== lifecycleGenerationRef.current ||
        !isAppActive()
      ) {
        console.log("[Online] stale goOnline skipped", {
          userId,
          source,
          reason: "pre-write-check",
          capturedGeneration,
          lifecycleGeneration: lifecycleGenerationRef.current,
        });
        return;
      }

      await syncRealtimeAuth(sessionData.session?.access_token);

      const onlineResult = await setUserOnline(userId, `goOnline:${source}`);

      if (
        cancelled ||
        capturedGeneration !== lifecycleGenerationRef.current ||
        !isAppActive()
      ) {
        console.log("[Online] stale goOnline skipped", {
          userId,
          source,
          reason: "post-write-check",
          capturedGeneration,
          lifecycleGeneration: lifecycleGenerationRef.current,
        });
        return;
      }

      console.log("[Online] goOnline presence update audit", {
        userId,
        source,
        effectGeneration,
        lifecycleGeneration: capturedGeneration,
        error: onlineResult.error,
        audit: onlineResult.audit,
      });

      if (onlineResult.error) {
        console.error("[Online] goOnline profile update failed", {
          userId,
          error: onlineResult.error,
          failureCause: onlineResult.audit?.failureCause ?? null,
          updateError: onlineResult.audit?.updateError ?? null,
          zeroRowsUpdated: onlineResult.audit?.updateCount === 0,
          profileExistsBefore: onlineResult.audit?.profileExistsBefore ?? null,
        });
        return;
      }

      console.log("[Online] goOnline confirmed active", {
        userId,
        lastSeenAt: onlineResult.lastSeenAt,
        source,
        lifecycleGeneration: capturedGeneration,
      });

      try {
        await appPresence.startTracking(userId);
      } catch (error) {
        console.error("[Online] presence track setup failed", error);
      }
    };

    const goOffline = async (capturedGeneration: number, context: string) => {
      if (activeUserIdRef.current !== userId) {
        console.log("[Online] goOffline skipped — active user changed", {
          userId,
          activeUserId: activeUserIdRef.current,
          context,
          capturedGeneration,
        });
        return;
      }

      if (capturedGeneration !== lifecycleGenerationRef.current) {
        console.log("[Online] stale goOffline skipped", {
          userId,
          context,
          reason: "generation",
          capturedGeneration,
          lifecycleGeneration: lifecycleGenerationRef.current,
        });
        return;
      }

      if (isAppActive()) {
        console.log("[Online] stale goOffline skipped", {
          userId,
          context,
          reason: "app-active",
          capturedGeneration,
          lifecycleGeneration: lifecycleGenerationRef.current,
          nativeAppActive: nativeAppActiveRef.current,
          visibilityState: document.visibilityState,
        });
        return;
      }

      console.log("[Online] goOffline()", {
        userId,
        context,
        effectGeneration,
        lifecycleGeneration: capturedGeneration,
      });

      await appPresence.untrack();
      await setUserOffline(userId, context);
    };

    const scheduleSafeOffline = (context: string) => {
      const capturedGeneration = lifecycleGenerationRef.current;

      cancelSafeOffline(`reschedule:${context}`);

      console.log("[Online] safe offline timeout scheduled", {
        userId,
        context,
        delayMs: PRESENCE_SAFE_OFFLINE_MS,
        lifecycleGeneration: capturedGeneration,
      });

      safeOfflineTimerRef.current = setTimeout(() => {
        safeOfflineTimerRef.current = null;
        void goOffline(capturedGeneration, `safe-timeout:${context}`);
      }, PRESENCE_SAFE_OFFLINE_MS);
    };

    const sendHeartbeat = async () => {
      if (cancelled || !isAppActive() || activeUserIdRef.current !== userId) {
        return;
      }

      const result = await setUserOnline(userId, "heartbeat");

      if (!result.error) {
        console.log("[Online] heartbeat updated", {
          userId,
          lastSeenAt: result.lastSeenAt,
        });
      }
    };

    const startHeartbeatInterval = (source: string, lifecycleGeneration: number) => {
      if (intervalRef.current) {
        return;
      }

      console.log("[Online] heartbeat started", {
        userId,
        source,
        effectGeneration,
        lifecycleGeneration,
        visibilityState: document.visibilityState,
        nativeAppActive: nativeAppActiveRef.current,
      });

      heartbeatRunningRef.current = true;
      intervalRef.current = setInterval(() => {
        void sendHeartbeat();
      }, PRESENCE_HEARTBEAT_MS);
    };

    const resumeActive = (source: string) => {
      const lifecycleGeneration = ++lifecycleGenerationRef.current;

      nativeAppActiveRef.current = true;
      cancelSafeOffline(source);

      console.log("[Online] resume active", {
        userId,
        source,
        lifecycleGeneration,
        visibilityState: document.visibilityState,
      });

      void goOnline(lifecycleGeneration, source);

      if (!intervalRef.current) {
        startHeartbeatInterval(source, lifecycleGeneration);
      }
    };

    const pauseInactive = (context: string) => {
      if (isCapacitorNative()) {
        nativeAppActiveRef.current = false;
      } else if (document.visibilityState === "hidden") {
        nativeAppActiveRef.current = false;
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      heartbeatRunningRef.current = false;
      console.log("[Online] heartbeat stopped (no immediate offline write)", {
        userId,
        context,
        effectGeneration,
        lifecycleGeneration: lifecycleGenerationRef.current,
      });

      void appPresence.untrack();
      scheduleSafeOffline(context);
    };

    const onVisibilityChange = () => {
      console.log("[Online] visibilitychange", {
        userId,
        visibilityState: document.visibilityState,
        effectGeneration,
        intervalActive: Boolean(intervalRef.current),
        heartbeatRunning: heartbeatRunningRef.current,
        lifecycleGeneration: lifecycleGenerationRef.current,
      });

      if (document.visibilityState === "visible") {
        console.log("[Online] visibilitychange -> visible", {
          userId,
          effectGeneration,
        });

        if (!isCapacitorNative()) {
          nativeAppActiveRef.current = true;
        }

        resumeActive("visibility-visible");
        return;
      }

      console.log("[Online] visibilitychange -> hidden (no immediate offline write)", {
        userId,
        effectGeneration,
      });

      if (!isCapacitorNative()) {
        pauseInactive("visibility-hidden");
      }
    };

    resumeActive("bootstrap-mount");
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onWindowFocus = () => {
      if (!isCapacitorNative()) {
        resumeActive("window-focus");
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!isCapacitorNative()) {
        console.log("[Online] pageshow", {
          userId,
          persisted: event.persisted,
        });
        resumeActive(event.persisted ? "pageshow-bfcache" : "pageshow");
      }
    };

    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("pageshow", onPageShow);

    let removeAppListener: (() => void) | undefined;
    let removeAuthListener: (() => void) | undefined;

    void (async () => {
      if (!isCapacitorNative()) {
        return;
      }

      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          console.log("[Online] appStateChange", {
            userId,
            isActive,
            effectGeneration,
            visibilityState: document.visibilityState,
            intervalActive: Boolean(intervalRef.current),
            heartbeatRunning: heartbeatRunningRef.current,
            lifecycleGeneration: lifecycleGenerationRef.current,
          });

          if (isActive) {
            console.log("[Online] appStateChange(isActive: true)", {
              userId,
              effectGeneration,
            });
            resumeActive("appStateChange-active");
            return;
          }

          console.log("[Online] appStateChange(isActive: false) — no immediate offline write", {
            userId,
            effectGeneration,
          });
          pauseInactive("capacitor-background");
        });

        removeAppListener = () => {
          void handle.remove();
        };
      } catch (error) {
        console.error("[Online] Capacitor App listener setup failed", error);
      }
    })();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        console.log("[Online] auth signed in — resume presence", { userId });
        resumeActive("signed-in");
        return;
      }

      if (event === "SIGNED_OUT") {
        console.log("[Online] explicit sign out", { userId });
        cancelSafeOffline("signed-out");
        void appPresence.untrack();
        void setUserOffline(userId, "signed-out");
      }
    });

    removeAuthListener = () => {
      authSubscription.unsubscribe();
    };

    return () => {
      console.log("[Online] bootstrap effect CLEANUP", {
        effectGeneration,
        reason: "lifecycle",
        userId,
      });
      cancelled = true;
      cancelSafeOffline("effect-cleanup");
      clearInterval(intervalRef.current ?? undefined);
      intervalRef.current = null;
      heartbeatRunningRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pageshow", onPageShow);
      removeAppListener?.();
      removeAuthListener?.();

      if (activeUserIdRef.current === userId) {
        activeUserIdRef.current = null;
      }
    };
  }, [authReady, userId]);

  return null;
}
