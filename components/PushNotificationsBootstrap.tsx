"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  enableNativePush,
  isNativePushSupported,
  nativePlatform,
  parseNativePushData,
  resolveNativeDeviceIdForPush,
  unregisterNativePushToken,
} from "@/lib/nativePush";
import { saveUserPushToken } from "@/lib/userPushTokens";
import { countUnreadNotifications } from "@/lib/notifications";

type PushNotificationsBootstrapProps = {
  userId: string | null;
};

/** Registers FCM on Capacitor iOS/Android and handles notification tap → in-app navigation. */
export default function PushNotificationsBootstrap({ userId }: PushNotificationsBootstrapProps) {
  const router = useRouter();
  const fcmTokenRef = useRef<string | null>(null);
  const listenersAttachedRef = useRef(false);

  useEffect(() => {
    console.info("[Push] bootstrap mounted", {
      userId,
      native: isNativePushSupported(),
      platform: isNativePushSupported() ? nativePlatform() : "web",
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    if (!isNativePushSupported()) {
      console.warn("[Push] bootstrap skipped — not a native Capacitor platform");
      return;
    }

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
            console.warn("[Push] tokenReceived ignored — missing token or userId");
            return;
          }

          console.info("[Push] token", `${event.token.slice(0, 12)}…`);
          fcmTokenRef.current = event.token;

          await saveUserPushToken({
            userId,
            token: event.token,
            platform: nativePlatform(),
            deviceId: await resolveNativeDeviceIdForPush(),
          });
        });

        await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
          const payload = parseNativePushData(
            (event.notification?.data as Record<string, unknown> | undefined) ?? undefined
          );
          console.info("[Push] notification opened", payload);
          navigateFromPush(payload.href);
        });
      } catch (error) {
        console.warn("[Push] Firebase push listeners skipped — GoogleService-Info.plist may be missing.", error);
      }
    };

    void (async () => {
      await attachListeners();

      const result = await enableNativePush(userId);

      if (cancelled) {
        return;
      }

      if (result.error === "firebase_not_configured") {
        console.warn("[Push] Firebase push disabled — add GoogleService-Info.plist to enable FCM.");
        return;
      }

      if (result.error) {
        console.error("[Push] registration failed", result.error);
        return;
      }

      if (result.token) {
        fcmTokenRef.current = result.token;
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

    return () => {
      cancelled = true;

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
  }, [userId]);

  useEffect(() => {
    if (userId || !isNativePushSupported()) {
      return;
    }

    void getSafeAuthSession().then(() => {
      void unregisterNativePushToken(fcmTokenRef.current);
      fcmTokenRef.current = null;
    });
  }, [userId]);

  return null;
}
