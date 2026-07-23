"use client";

import { isCapacitorNative } from "@/lib/capacitorUtils";
import {
  saveUserPushToken,
  removeUserPushToken,
  removeAllUserPushTokensForUser,
  type PushPlatform,
} from "@/lib/userPushTokens";

/** Structured step logs — search Xcode / Safari Web Inspector for `[Push][step`. */
function pushStep(step: string, message: string, detail?: Record<string, unknown>) {
  if (detail) {
    console.info(`[Push][step ${step}] ${message}`, detail);
  } else {
    console.info(`[Push][step ${step}] ${message}`);
  }
}

function pushStepError(step: string, message: string, detail?: Record<string, unknown>) {
  if (detail) {
    console.error(`[Push][step ${step}] FAIL ${message}`, detail);
  } else {
    console.error(`[Push][step ${step}] FAIL ${message}`);
  }
}

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
  } catch (error) {
    pushStepError("deviceId", "App.getInfo failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

type FirebaseMessagingModule = typeof import("@capacitor-firebase/messaging").FirebaseMessaging;

function isApnsNotReadyError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("apns") ||
    lower.includes("apn") ||
    lower.includes("no apns token") ||
    lower.includes("505")
  );
}

function tokenPreview(token: string | null | undefined, chars = 16) {
  if (!token) {
    return null;
  }
  return `${token.slice(0, chars)}…(len=${token.length})`;
}

async function tryGetToken(FirebaseMessaging: FirebaseMessagingModule, attempt: number) {
  pushStep("5", "FirebaseMessaging.getToken() calling", { attempt });

  try {
    const { token } = await FirebaseMessaging.getToken();
    if (token?.trim()) {
      pushStep("5", "FirebaseMessaging.getToken() OK", {
        attempt,
        tokenPreview: tokenPreview(token.trim()),
      });
      return { token: token.trim(), error: null as string | null };
    }

    pushStepError("5", "FirebaseMessaging.getToken() returned empty token", { attempt });
    return { token: null as string | null, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushStepError("5", "FirebaseMessaging.getToken() threw", {
      attempt,
      error: message,
      apnsNotReady: isApnsNotReadyError(message),
    });
    if (isApnsNotReadyError(message)) {
      return { token: null as string | null, error: "apns_not_ready" as const };
    }
    return { token: null as string | null, error: message };
  }
}

/**
 * iOS often resolves requestPermissions before APNs has delivered a device token.
 * Calling getToken() too early fails with "No APNS token specified" and never saves.
 * Wait for apnsTokenReceived / tokenReceived and retry getToken.
 */
async function resolveFcmToken(FirebaseMessaging: FirebaseMessagingModule): Promise<{
  token: string | null;
  error: string | null;
}> {
  const handles: Array<{ remove: () => Promise<void> }> = [];
  let apnsSeen = false;
  let eventToken: string | null = null;
  let getTokenAttempts = 0;

  try {
    pushStep("2-listen", "Attaching APNs/FCM Cap listeners");

    const tokenHandle = await FirebaseMessaging.addListener("tokenReceived", (event) => {
      if (event.token?.trim()) {
        eventToken = event.token.trim();
        pushStep("5-event", "FCM tokenReceived event", {
          tokenPreview: tokenPreview(eventToken),
        });
      } else {
        pushStepError("5-event", "tokenReceived fired with empty token", {
          event: event as unknown as Record<string, unknown>,
        });
      }
    });
    handles.push(tokenHandle);

    if (nativePlatform() === "ios") {
      const apnsHandle = await FirebaseMessaging.addListener("apnsTokenReceived", (event) => {
        apnsSeen = true;
        const raw = typeof event.token === "string" ? event.token : "";
        pushStep("3", "JS apnsTokenReceived (from Cap plugin after native callback)", {
          tokenPreview: tokenPreview(raw, 32),
          tokenLength: raw.length,
        });
      });
      handles.push(apnsHandle);
    } else {
      pushStep("3", "Skipping APNs listener (not iOS)", { platform: nativePlatform() });
    }

    getTokenAttempts += 1;
    const immediate = await tryGetToken(FirebaseMessaging, getTokenAttempts);
    if (immediate.token) {
      return { token: immediate.token, error: null };
    }
    if (immediate.error && immediate.error !== "apns_not_ready") {
      return { token: null, error: immediate.error };
    }

    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      pushStep("2", "PushNotifications.register() calling (inside resolveFcmToken)");
      await PushNotifications.register();
      pushStep("2", "PushNotifications.register() resolved (APNs callback may still be pending)");
    } catch (error) {
      pushStepError("2", "PushNotifications.register() threw", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const deadline = Date.now() + 20_000;
    pushStep("5-wait", "Waiting up to 20s for APNs + FCM token", {
      platform: nativePlatform(),
      deadlineMs: 20_000,
    });

    while (Date.now() < deadline) {
      if (eventToken) {
        pushStep("5", "Using FCM token from tokenReceived event");
        return { token: eventToken, error: null };
      }

      await new Promise((resolve) => setTimeout(resolve, apnsSeen ? 400 : 800));

      if (eventToken) {
        pushStep("5", "Using FCM token from tokenReceived event (after wait)");
        return { token: eventToken, error: null };
      }

      getTokenAttempts += 1;
      const attempt = await tryGetToken(FirebaseMessaging, getTokenAttempts);
      if (attempt.token) {
        return { token: attempt.token, error: null };
      }
      if (attempt.error && attempt.error !== "apns_not_ready") {
        return { token: null, error: attempt.error };
      }

      pushStep("5-wait", "Still waiting for FCM token", {
        apnsSeen,
        getTokenAttempts,
        remainingMs: Math.max(0, deadline - Date.now()),
      });
    }

    if (eventToken) {
      return { token: eventToken, error: null };
    }

    const failCode = apnsSeen ? "missing_token_after_apns" : "missing_token_apns_timeout";
    pushStepError("5", "Timed out without FCM token", {
      failCode,
      apnsSeen,
      getTokenAttempts,
    });
    return { token: null, error: failCode };
  } finally {
    await Promise.all(
      handles.map(async (handle) => {
        try {
          await handle.remove();
        } catch (error) {
          pushStepError("2-listen", "Failed removing Cap listener", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  }
}

export async function enableNativePush(userId: string) {
  pushStep("0", "enableNativePush start", {
    userId,
    native: isNativePushSupported(),
    platform: nativePlatform(),
  });

  if (!isNativePushSupported()) {
    pushStepError("0", "Not a native Capacitor platform — abort");
    return { token: null as string | null, error: "unsupported" as const };
  }

  try {
    pushStep("0", "Importing @capacitor-firebase/messaging");
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

    pushStep("1", "FirebaseMessaging.requestPermissions() calling");
    const permission = await FirebaseMessaging.requestPermissions();
    pushStep("1", "Notification permission result", {
      receive: permission.receive,
      granted: permission.receive === "granted",
    });

    if (permission.receive !== "granted") {
      pushStepError("1", "Permission not granted — abort", { receive: permission.receive });
      return { token: null as string | null, error: "denied" as const };
    }

    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      pushStep("2", "PushNotifications.register() calling (after permission)");
      await PushNotifications.register();
      pushStep("2", "PushNotifications.register() resolved");
    } catch (error) {
      pushStepError("2", "PushNotifications.register() after permission failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Do not call removeAllDeliveredNotifications here — on iOS it also forces
    // applicationIconBadgeNumber = 0, which fights the chat-unread badge sync.

    const resolved = await resolveFcmToken(FirebaseMessaging);

    if (!resolved.token) {
      pushStepError("5", "No FCM token — abort before Supabase upsert", {
        error: resolved.error,
      });
      return {
        token: null as string | null,
        error: (resolved.error ?? "missing_token") as string,
      };
    }

    pushStep("5", "FCM token ready for Supabase", {
      tokenPreview: tokenPreview(resolved.token),
    });

    const deviceId = await resolveNativeDeviceIdForPush();
    pushStep("6", "Calling saveUserPushToken (Supabase upsert)", {
      userId,
      platform: nativePlatform(),
      deviceId,
      tokenPreview: tokenPreview(resolved.token),
    });

    const saveResult = await saveUserPushToken({
      userId,
      token: resolved.token,
      platform: nativePlatform(),
      deviceId,
    });

    if (saveResult.error) {
      pushStepError("6", "Supabase upsert failed", { error: saveResult.error });
      return { token: null as string | null, error: saveResult.error };
    }

    pushStep("6", "Supabase upsert OK — row should exist in user_push_tokens", {
      rowId: saveResult.rowId ?? null,
      userId,
      tokenPreview: tokenPreview(resolved.token),
    });

    pushStep("7", "Registration flow complete", {
      userId,
      platform: nativePlatform(),
      rowId: saveResult.rowId ?? null,
    });

    return { token: resolved.token, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    if (
      message.toLowerCase().includes("google-service-info") ||
      message.toLowerCase().includes("not configured") ||
      message.toLowerCase().includes("firebase is not configured")
    ) {
      pushStepError("7", "Firebase not configured", { error: message, stack });
      return { token: null as string | null, error: "firebase_not_configured" as const };
    }

    pushStepError("7", "enableNativePush caught error", { error: message, stack });
    return { token: null as string | null, error: message || ("setup_failed" as const) };
  }
}

export async function unregisterNativePushToken(token: string | null) {
  if (!token) {
    pushStep("logout", "Skip remove — no in-memory FCM token (nothing to delete locally)");
    return;
  }

  pushStep("logout", "Removing push token after confirmed SIGNED_OUT", {
    tokenPreview: tokenPreview(token),
  });
  await removeUserPushToken(token);
}

/**
 * Call while the user JWT is still valid (before supabase.auth.signOut).
 */
export async function unregisterPushBeforeSignOut(userId: string) {
  pushStep("logout", "Pre-signOut push token cleanup (session still valid)", { userId });
  await removeAllUserPushTokensForUser(userId);
}

/**
 * After SIGNED_OUT: clear in-memory state. DB delete is best-effort only —
 * RLS usually requires auth.uid(), so prefer unregisterPushBeforeSignOut().
 */
export async function unregisterPushAfterConfirmedLogout(input: {
  previousUserId: string;
  token: string | null;
}) {
  pushStep("logout", "Post-SIGNED_OUT local cleanup", {
    previousUserId: input.previousUserId,
    hasInMemoryToken: Boolean(input.token),
  });

  if (input.token) {
    const result = await removeUserPushToken(input.token);
    if (result.error) {
      pushStepError("logout", "Post-SIGNED_OUT token delete failed (expected if JWT already cleared)", {
        error: result.error,
      });
    }
  }
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
