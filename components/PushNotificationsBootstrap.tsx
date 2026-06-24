"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  enableNativePush,
  isNativePushSupported,
  parseNativePushData,
  unregisterNativePushToken,
} from "@/lib/nativePush";
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
    if (!userId || !isNativePushSupported()) {
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
            return;
          }

          fcmTokenRef.current = event.token;
          const { saveFcmDeviceToken } = await import("@/lib/fcmDeviceTokens");
          const { nativePlatform } = await import("@/lib/nativePush");
          await saveFcmDeviceToken({
            userId,
            fcmToken: event.token,
            platform: nativePlatform(),
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
      void unregisterNativePushToken(fcmTokenRef.current);
      fcmTokenRef.current = null;

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
