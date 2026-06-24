"use client";

import { isCapacitorNative } from "@/lib/capacitorUtils";
import { saveFcmDeviceToken, removeFcmDeviceToken, type FcmPlatform } from "@/lib/fcmDeviceTokens";

export function isNativePushSupported() {
  return isCapacitorNative();
}

export function nativePlatform(): FcmPlatform {
  if (typeof window === "undefined") {
    return "web";
  }

  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const platform = cap?.getPlatform?.();

    if (platform === "ios") {
      return "ios";
    }

    if (platform === "android") {
      return "android";
    }
  } catch {
    // fall through
  }

  return "web";
}

export async function enableNativePush(userId: string) {
  if (!isNativePushSupported()) {
    return { token: null as string | null, error: "unsupported" as const };
  }

  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    const permission = await FirebaseMessaging.requestPermissions();

    if (permission.receive !== "granted") {
      return { token: null as string | null, error: "denied" as const };
    }

    await FirebaseMessaging.removeAllDeliveredNotifications();

    const { token } = await FirebaseMessaging.getToken();

    if (!token) {
      return { token: null as string | null, error: "missing_token" as const };
    }

    const saveResult = await saveFcmDeviceToken({
      userId,
      fcmToken: token,
      platform: nativePlatform(),
    });

    if (saveResult.error) {
      return { token: null as string | null, error: saveResult.error };
    }

    console.info("[Push] FCM token registered", { platform: nativePlatform() });

    return { token, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.toLowerCase().includes("google-service-info") || message.toLowerCase().includes("not configured")) {
      console.warn("[Push] Firebase push disabled — GoogleService-Info.plist missing or invalid.");
      return { token: null as string | null, error: "firebase_not_configured" as const };
    }

    console.warn("[Push] Native push setup failed:", message);
    return { token: null as string | null, error: "setup_failed" as const };
  }
}

export async function unregisterNativePushToken(token: string | null) {
  if (!token) {
    return;
  }

  await removeFcmDeviceToken(token);
}

export type NativePushOpenPayload = {
  href: string;
  type?: string;
};

export function parseNativePushData(data: Record<string, unknown> | undefined): NativePushOpenPayload {
  const href = typeof data?.href === "string" && data.href.trim() ? data.href.trim() : "/notifications";
  const type = typeof data?.type === "string" ? data.type : undefined;

  return { href, type };
}
