"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  enableNativePush,
  isNativePushSupported,
  nativePlatform,
  parseNativePushData,
  resolveNativeDeviceIdForPush,
  unregisterPushAfterConfirmedLogout,
} from "@/lib/nativePush";
import { saveUserPushToken } from "@/lib/userPushTokens";
import { countUnreadNotifications } from "@/lib/notifications";
import { loadUserSettingsPreferences } from "@/lib/settingsPreferences";
import { syncUserNotificationPreferences } from "@/lib/userNotificationPreferences";
import { supabase } from "@/lib/supabaseClient";

type PushNotificationsBootstrapProps = {
  userId: string | null;
  /** False until the first session resolve — avoids treating startup null as logout. */
  authReady: boolean;
};

/** Registers FCM on Capacitor iOS/Android and handles notification tap → in-app navigation. */
export default function PushNotificationsBootstrap({
  userId,
  authReady,
}: PushNotificationsBootstrapProps) {
  const router = useRouter();
  const fcmTokenRef = useRef<string | null>(null);
  const listenersAttachedRef = useRef(false);
  /** Last user id that completed (or started) push registration while signed in. */
  const confirmedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    console.info("[Push][step 0] bootstrap mounted", {
      userId,
      authReady,
      native: isNativePushSupported(),
      platform: isNativePushSupported() ? nativePlatform() : "web",
    });
  }, [userId, authReady]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    // Keep server prefs in sync so APNs can honor Sound / category toggles.
    void syncUserNotificationPreferences(userId, loadUserSettingsPreferences().notifications);
  }, [userId]);

  useEffect(() => {
    if (!authReady || !userId) {
      return;
    }

    if (!isNativePushSupported()) {
      console.error("[Push][step 0] FAIL bootstrap skipped — not a native Capacitor platform");
      return;
    }

    confirmedUserIdRef.current = userId;

    console.info("[Push][step 0] bootstrap registration effect start", {
      userId,
      platform: nativePlatform(),
    });

    let cancelled = false;

    const navigateFromPush = (href: string) => {
      const path = href.startsWith("/") ? href : "/notifications";
      router.push(path);
    };

    const attachListeners = async () => {
      try {
        const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

        if (cancelled || listenersAttachedRef.current) {
          return;
        }

        listenersAttachedRef.current = true;

        await FirebaseMessaging.addListener("tokenReceived", async (event) => {
          if (!event.token || !userId) {
            console.error("[Push][step 5-event] FAIL tokenReceived ignored", {
              hasToken: Boolean(event.token),
              userId,
            });
            return;
          }

          console.info("[Push][step 5-event] bootstrap tokenReceived → saveUserPushToken", {
            tokenPreview: `${event.token.slice(0, 16)}…(len=${event.token.length})`,
            userId,
          });
          fcmTokenRef.current = event.token;

          const saveResult = await saveUserPushToken({
            userId,
            token: event.token,
            platform: nativePlatform(),
            deviceId: await resolveNativeDeviceIdForPush(),
          });

          if (saveResult.error) {
            console.error("[Push][step 6] FAIL bootstrap tokenReceived save", saveResult.error);
          } else {
            console.info("[Push][step 6] OK bootstrap tokenReceived save", {
              rowId: saveResult.rowId ?? null,
            });
          }
        });

        await FirebaseMessaging.addListener("apnsTokenReceived", (event) => {
          console.info("[Push][step 3] bootstrap apnsTokenReceived", {
            tokenPreview:
              typeof event.token === "string" && event.token.length > 0
                ? `${event.token.slice(0, 32)}…(len=${event.token.length})`
                : "(empty)",
          });
        });

        // Foreground: Realtime already shows in-app banner + WAV. Do not also play FCM sound
        // here (that duplicated audio, and could fire again when resuming with a queued push).
        await FirebaseMessaging.addListener("notificationReceived", (event) => {
          const data = (event.notification?.data as Record<string, unknown> | undefined) ?? {};
          const payload = parseNativePushData(data);
          console.info("[Push] notification received (foreground) — realtime handles banner", payload);
        });

        await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
          const payload = parseNativePushData(
            (event.notification?.data as Record<string, unknown> | undefined) ?? undefined
          );
          console.info("[Push] notification opened", payload);
          navigateFromPush(payload.href);
        });
      } catch (error) {
        console.error("[Push][step 0] FAIL Firebase listeners attach", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };

    void (async () => {
      console.info("[Push][step 0] Calling attachListeners + enableNativePush", { userId });
      await attachListeners();

      const result = await enableNativePush(userId);

      if (cancelled) {
        console.warn("[Push][step 7] Registration cancelled (effect cleanup) — token NOT deleted");
        return;
      }

      if (result.error === "firebase_not_configured") {
        console.error("[Push][step 7] FAIL firebase_not_configured — GoogleService-Info.plist missing/invalid");
        return;
      }

      if (result.error) {
        console.error("[Push][step 7] FAIL registration failed", {
          error: result.error,
          userId,
        });
        return;
      }

      if (result.token) {
        fcmTokenRef.current = result.token;
        console.info("[Push][step 7] OK registration — expect row in public.user_push_tokens", {
          userId,
          tokenPreview: `${result.token.slice(0, 16)}…(len=${result.token.length})`,
        });
      } else {
        console.error("[Push][step 7] FAIL registration returned no token and no error");
      }

      const { count } = await countUnreadNotifications(userId);

      if (!cancelled && count > 0) {
        try {
          const { FirebaseMessaging: FCM } = await import("@capacitor-firebase/messaging");
          await FCM.removeAllDeliveredNotifications();
        } catch {
          // badge sync is best-effort on client; server sets badge on push
        }
      }
    })();

    // Retry registration when returning to foreground if the first attempt missed APNs.
    let removeAppListener: (() => void) | undefined;
    let lastResumeRegisterAt = 0;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive || cancelled || !userId || fcmTokenRef.current) {
            return;
          }

          const now = Date.now();
          if (now - lastResumeRegisterAt < 15_000) {
            return;
          }
          lastResumeRegisterAt = now;

          void enableNativePush(userId).then((result) => {
            if (result.token) {
              fcmTokenRef.current = result.token;
            } else if (result.error) {
              console.warn("[Push] resume re-register", result.error);
            }
          });
        });

        removeAppListener = () => {
          void handle.remove();
        };
      } catch {
        // web / unsupported
      }
    })();

    return () => {
      cancelled = true;
      removeAppListener?.();

      void (async () => {
        try {
          const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
          await FirebaseMessaging.removeAllListeners();
        } catch {
          // ignore
        }
      })();

      listenersAttachedRef.current = false;
    };
  }, [authReady, userId, router]);

  // Delete push token only after a real Supabase SIGNED_OUT, and only if we previously
  // had a confirmed signed-in user. Never on startup null, session refresh, or remount.
  useEffect(() => {
    if (!isNativePushSupported()) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_OUT") {
        if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          console.info("[Push][step auth] Ignoring non-logout auth event — token kept", {
            event,
            hasSession: Boolean(session),
            confirmedUserId: confirmedUserIdRef.current,
          });
        }
        return;
      }

      const previousUserId = confirmedUserIdRef.current;

      if (!previousUserId) {
        console.info("[Push][step logout] SIGNED_OUT ignored — no prior confirmed session (startup/loading)", {
          event,
        });
        return;
      }

      if (session?.user?.id) {
        console.info("[Push][step logout] SIGNED_OUT ignored — session still present", {
          sessionUserId: session.user.id,
        });
        return;
      }

      const token = fcmTokenRef.current;
      console.info("[Push][step logout] Confirmed logout — removing push token", {
        previousUserId,
        hasToken: Boolean(token),
        event,
      });

      confirmedUserIdRef.current = null;
      fcmTokenRef.current = null;

      void unregisterPushAfterConfirmedLogout({ previousUserId, token });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
