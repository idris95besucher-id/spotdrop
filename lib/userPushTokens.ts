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
  console.error("[Push][step 6] FAIL save token", context);
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

async function waitForAuthSession(userId: string, maxAttempts = 20) {
  console.info("[Push][step 6] Waiting for auth session before upsert", {
    userId,
    maxAttempts,
  });

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    const sessionUserId = data.session?.user?.id ?? null;

    if (!error && sessionUserId === userId) {
      console.info("[Push][step 6] Auth session ready", {
        userId,
        attempt: attempt + 1,
        hasAccessToken: Boolean(data.session?.access_token),
      });
      return { ready: true as const, sessionUserId };
    }

    if (attempt === 0 || attempt === maxAttempts - 1) {
      console.warn("[Push][step 6] Auth session not ready yet", {
        attempt: attempt + 1,
        expectedUserId: userId,
        sessionUserId,
        sessionError: error?.message ?? null,
      });
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
  console.info("[Push][step 6] Legacy fcm_device_tokens upsert", {
    userId: input.userId,
    platform: input.platform,
    tokenPreview: `${input.token.slice(0, 16)}…`,
  });

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
    console.error("[Push][step 6] FAIL legacy upsert", formatSupabaseError(error));
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
  console.info("[Push][step 6] saveUserPushToken entered", {
    userId: input.userId,
    platform: input.platform,
    deviceId: input.deviceId ?? null,
    tokenPreview: `${input.token.slice(0, 16)}…(len=${input.token.length})`,
  });

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

  const row = {
    user_id: input.userId,
    token: input.token,
    platform: input.platform,
    device_id: input.deviceId ?? null,
    updated_at: new Date().toISOString(),
  };

  let lastError: ReturnType<typeof formatSupabaseError> | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    console.info("[Push][step 6] Upserting public.user_push_tokens", {
      attempt: attempt + 1,
      onConflict: "user_id,token",
      user_id: row.user_id,
      platform: row.platform,
      device_id: row.device_id,
      tokenPreview: `${row.token.slice(0, 16)}…`,
    });

    const { data, error, status, statusText } = await supabase
      .from("user_push_tokens")
      .upsert(row, { onConflict: "user_id,token" })
      .select("id")
      .maybeSingle();

    console.info("[Push][step 6] Upsert response", {
      attempt: attempt + 1,
      status: status ?? null,
      statusText: statusText ?? null,
      rowId: data?.id ?? null,
      hasError: Boolean(error),
      error: error ? formatSupabaseError(error) : null,
    });

    if (!error) {
      console.info("[Push][step 6] OK public.user_push_tokens upsert", {
        rowId: data?.id ?? null,
        table: "user_push_tokens",
        attempt: attempt + 1,
      });
      void upsertLegacyFcmToken(input);
      return { error: null, rowId: data?.id ?? null };
    }

    lastError = formatSupabaseError(error);

    if (isMissingPushTokensTable(error)) {
      console.warn("[Push][step 6] user_push_tokens missing — falling back", lastError);
      const legacy = await upsertLegacyFcmToken(input);

      if (legacy.error) {
        logSaveTokenFailed({ step: "legacy_upsert", ...lastError, legacyError: legacy.error });
        return { error: `${lastError.message} (legacy: ${legacy.error})` };
      }

      console.info("[Push][step 6] OK saved to fcm_device_tokens (legacy)");
      return { error: null, rowId: null };
    }

    if (error.code === "23503" || lastError.message.toLowerCase().includes("foreign key")) {
      logSaveTokenFailed({ step: "upsert_fk", attempt: attempt + 1, ...lastError });
      await new Promise((resolve) => setTimeout(resolve, 400));
      continue;
    }

    logSaveTokenFailed({ step: "upsert", attempt: attempt + 1, ...lastError });
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.error("[Push][step 6] FAIL all upsert attempts exhausted", lastError);
  return { error: lastError?.message ?? "Failed to save push token" };
}

export async function removeUserPushToken(token: string) {
  console.info("[Push][step logout] Deleting token from user_push_tokens", {
    tokenPreview: `${token.slice(0, 16)}…`,
  });

  const { error: primaryError } = await supabase.from("user_push_tokens").delete().eq("token", token);

  if (primaryError && !isMissingPushTokensTable(primaryError)) {
    console.error("[Push][step logout] FAIL delete user_push_tokens", formatSupabaseError(primaryError));
    return { error: primaryError.message };
  }

  const { error: legacyError } = await supabase.from("fcm_device_tokens").delete().eq("fcm_token", token);

  if (legacyError && !isMissingPushTokensTable(legacyError)) {
    console.error("[Push][step logout] FAIL delete fcm_device_tokens", formatSupabaseError(legacyError));
    return { error: legacyError.message };
  }

  return { error: null as string | null };
}

/** Confirmed logout only — deletes all rows for this user while the session JWT is still valid. */
export async function removeAllUserPushTokensForUser(userId: string) {
  console.info("[Push][step logout] Deleting all push tokens for user after confirmed SIGNED_OUT", {
    userId,
  });

  const { error: primaryError } = await supabase.from("user_push_tokens").delete().eq("user_id", userId);

  if (primaryError && !isMissingPushTokensTable(primaryError)) {
    console.error("[Push][step logout] FAIL delete-by-user user_push_tokens", formatSupabaseError(primaryError));
    return { error: primaryError.message };
  }

  const { error: legacyError } = await supabase.from("fcm_device_tokens").delete().eq("user_id", userId);

  if (legacyError && !isMissingPushTokensTable(legacyError)) {
    console.error("[Push][step logout] FAIL delete-by-user fcm_device_tokens", formatSupabaseError(legacyError));
    return { error: legacyError.message };
  }

  console.info("[Push][step logout] OK deleted push tokens for user", { userId });
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
