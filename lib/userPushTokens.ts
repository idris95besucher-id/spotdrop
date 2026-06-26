"use client";

import { supabase } from "@/lib/supabaseClient";

export type PushPlatform = "ios" | "android" | "web";

const TOKEN_TABLES = ["user_push_tokens", "fcm_device_tokens"] as const;

export type SaveUserPushTokenResult = {
  error: string | null;
  rowId?: string | null;
};

function formatSupabaseError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  return {
    code: error.code ?? null,
    message: error.message ?? "Unknown Supabase error",
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

function logSaveTokenFailed(context: Record<string, unknown>) {
  console.error("[Push] save token failed", context);
}

function isMissingPushTokensTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("user_push_tokens") && message.includes("does not exist")) ||
    (message.includes("fcm_device_tokens") && message.includes("does not exist"))
  );
}

async function waitForAuthSession(userId: string, maxAttempts = 8) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    const sessionUserId = data.session?.user?.id ?? null;

    if (!error && sessionUserId === userId) {
      return { ready: true as const, sessionUserId };
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const { data, error } = await supabase.auth.getSession();

  return {
    ready: false as const,
    sessionUserId: data.session?.user?.id ?? null,
    sessionError: error?.message ?? null,
  };
}

async function upsertLegacyFcmToken(input: {
  userId: string;
  token: string;
  platform: PushPlatform;
  deviceId?: string | null;
}) {
  const { error } = await supabase.from("fcm_device_tokens").upsert(
    {
      user_id: input.userId,
      fcm_token: input.token,
      platform: input.platform,
      device_id: input.deviceId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,fcm_token" }
  );

  if (error && !isMissingPushTokensTable(error)) {
    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function saveUserPushToken(input: {
  userId: string;
  token: string;
  platform: PushPlatform;
  deviceId?: string | null;
}): Promise<SaveUserPushTokenResult> {
  const authWait = await waitForAuthSession(input.userId);

  if (!authWait.ready) {
    logSaveTokenFailed({
      step: "auth_session",
      expectedUserId: input.userId,
      sessionUserId: authWait.sessionUserId,
      sessionError: authWait.sessionError,
    });

    return {
      error: authWait.sessionError
        ? `Auth session error: ${authWait.sessionError}`
        : `Auth session not ready for user ${input.userId}`,
    };
  }

  console.info("[Push] saving token", {
    userId: input.userId,
    platform: input.platform,
    deviceId: input.deviceId ?? null,
    tokenPreview: `${input.token.slice(0, 12)}…`,
  });

  const row = {
    user_id: input.userId,
    token: input.token,
    platform: input.platform,
    device_id: input.deviceId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_push_tokens")
    .upsert(row, { onConflict: "user_id,token" })
    .select("id")
    .maybeSingle();

  if (error) {
    const formatted = formatSupabaseError(error);

    if (isMissingPushTokensTable(error)) {
      console.warn("[Push] user_push_tokens missing — falling back to fcm_device_tokens", formatted);
      const legacy = await upsertLegacyFcmToken(input);

      if (legacy.error) {
        logSaveTokenFailed({ step: "legacy_upsert", ...formatted, legacyError: legacy.error });
        return { error: `${formatted.message} (legacy: ${legacy.error})` };
      }

      console.info("[Push] token saved", { table: "fcm_device_tokens" });
      return { error: null, rowId: null };
    }

    logSaveTokenFailed({ step: "upsert", ...formatted });
    return { error: formatted.message };
  }

  console.info("[Push] token saved", { rowId: data?.id ?? null, table: "user_push_tokens" });

  void upsertLegacyFcmToken(input);

  return { error: null, rowId: data?.id ?? null };
}

export async function removeUserPushToken(token: string) {
  const { error: primaryError } = await supabase.from("user_push_tokens").delete().eq("token", token);

  if (primaryError && !isMissingPushTokensTable(primaryError)) {
    return { error: primaryError.message };
  }

  const { error: legacyError } = await supabase.from("fcm_device_tokens").delete().eq("fcm_token", token);

  if (legacyError && !isMissingPushTokensTable(legacyError)) {
    return { error: legacyError.message };
  }

  return { error: null as string | null };
}

/** @deprecated Use saveUserPushToken */
export async function saveFcmDeviceToken(input: {
  userId: string;
  fcmToken: string;
  platform: PushPlatform;
  deviceId?: string | null;
}) {
  return saveUserPushToken({
    userId: input.userId,
    token: input.fcmToken,
    platform: input.platform,
    deviceId: input.deviceId,
  });
}

/** @deprecated Use removeUserPushToken */
export async function removeFcmDeviceToken(fcmToken: string) {
  return removeUserPushToken(fcmToken);
}

export { TOKEN_TABLES as PUSH_TOKEN_TABLES };
