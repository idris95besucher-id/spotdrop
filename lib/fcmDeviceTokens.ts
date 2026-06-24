import { supabase } from "@/lib/supabaseClient";

export type FcmPlatform = "ios" | "android" | "web";

function isMissingFcmTokensTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("fcm_device_tokens") && message.includes("does not exist"))
  );
}

export async function saveFcmDeviceToken(input: {
  userId: string;
  fcmToken: string;
  platform: FcmPlatform;
  deviceId?: string | null;
}) {
  const { error } = await supabase.from("fcm_device_tokens").upsert(
    {
      user_id: input.userId,
      fcm_token: input.fcmToken,
      platform: input.platform,
      device_id: input.deviceId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,fcm_token" }
  );

  if (error) {
    if (isMissingFcmTokensTable(error)) {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function removeFcmDeviceToken(fcmToken: string) {
  const { error } = await supabase.from("fcm_device_tokens").delete().eq("fcm_token", fcmToken);

  if (error) {
    if (isMissingFcmTokensTable(error)) {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  return { error: null as string | null };
}
