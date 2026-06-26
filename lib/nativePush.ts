"use client";

import { isCapacitorNative } from "@/lib/capacitorUtils";
import {
  saveUserPushToken,
  removeUserPushToken,
  type PushPlatform,
} from "@/lib/userPushTokens";

export function isNativePushSupported() {
  return isCapacitorNative();
}

export function nativePlatform(): PushPlatform {
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

export async function resolveNativeDeviceIdForPush() {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info.id?.trim() || null;
  } catch {
    return null;
  }
}

export async function enableNativePush(userId: string) {
  if (!isNativePushSupported()) {
    console.warn("[Push] enableNativePush skipped — not a native platform");
    return { token: null as string | null, error: "unsupported" as const };
  }

  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    const permission = await FirebaseMessaging.requestPermissions();
    console.info("[Push] permission", permission.receive);

    if (permission.receive !== "granted") {
      return { token: null as string | null, error: "denied" as const };
    }

    await FirebaseMessaging.removeAllDeliveredNotifications();

    const { token } = await FirebaseMessaging.getToken();
    console.info("[Push] token", token ? `${token.slice(0, 12)}…` : null);

    if (!token) {
      return { token: null as string | null, error: "missing_token" as const };
    }

    const deviceId = await resolveNativeDeviceIdForPush();

    const saveResult = await saveUserPushToken({
      userId,
      token,
      platform: nativePlatform(),
      deviceId,
    });

    if (saveResult.error) {
      return { token: null as string | null, error: saveResult.error };
    }

    return { token, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.toLowerCase().includes("google-service-info") || message.toLowerCase().includes("not configured")) {
      console.warn("[Push] Firebase push disabled — GoogleService-Info.plist missing or invalid.", message);
      return { token: null as string | null, error: "firebase_not_configured" as const };
    }

    console.error("[Push] enableNativePush failed", message);
    return { token: null as string | null, error: message || ("setup_failed" as const) };
  }
}

export async function unregisterNativePushToken(token: string | null) {
  if (!token) {
    return;
  }

  console.info("[Push] removing token on logout", { tokenPreview: `${token.slice(0, 12)}…` });
  await removeUserPushToken(token);
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
