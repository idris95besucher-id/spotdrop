import { supabase } from "@/lib/supabaseClient";
import { normalizeMessagePrivacy, type MessagePrivacy } from "@/lib/messagePrivacy";
import {
  normalizeProfileGalleryVisibility,
  type ProfileGalleryVisibility,
} from "@/lib/profileGalleryVisibility";
import { normalizeOnlineVisibility, type OnlineVisibility } from "@/lib/onlineVisibility";

export type ProfilePrivacySettings = {
  isPrivate: boolean;
  messagePrivacy: MessagePrivacy;
  onlineVisibility: OnlineVisibility;
  galleryVisibility: ProfileGalleryVisibility;
};

const LOAD_PRIVACY_ERROR = "Unable to load privacy settings.";

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  if (error.code === "42703" || error.code === "PGRST204") {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";

  return message.includes("column") && message.includes("does not exist");
}

async function loadProfileScalar<T>(
  userId: string,
  column: string,
  normalize: (value: unknown) => T,
  fallback: T
): Promise<{ value: T; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select(column)
    .eq("id", userId)
    .maybeSingle();

  if (!error) {
    const row = (data ?? {}) as Record<string, unknown>;
    return { value: normalize(row[column]), error: null };
  }

  if (isMissingColumnError(error)) {
    return { value: fallback, error: null };
  }

  return { value: fallback, error: error.message || LOAD_PRIVACY_ERROR };
}

/** Load privacy fields independently so one missing column never fails the whole screen. */
export async function loadProfilePrivacySettings(userId: string): Promise<{
  data: ProfilePrivacySettings | null;
  error: string | null;
}> {
  const [isPrivateResult, messagePrivacyResult, onlineVisibilityResult, galleryVisibilityResult] =
    await Promise.all([
      loadProfileScalar(userId, "is_private", (value) => Boolean(value), false),
      loadProfileScalar(userId, "message_privacy", normalizeMessagePrivacy, "everyone"),
      loadProfileScalar(userId, "online_visibility", normalizeOnlineVisibility, "everyone"),
      loadProfileScalar(
        userId,
        "gallery_visibility",
        normalizeProfileGalleryVisibility,
        "everyone"
      ),
    ]);

  const criticalErrors = [isPrivateResult.error, messagePrivacyResult.error].filter(Boolean);

  if (criticalErrors.length > 0) {
    console.error("Failed to load profile privacy settings:", criticalErrors);
    return {
      data: null,
      error: criticalErrors[0] ?? LOAD_PRIVACY_ERROR,
    };
  }

  if (onlineVisibilityResult.error || galleryVisibilityResult.error) {
    console.warn("Profile privacy settings partially loaded:", {
      onlineVisibility: onlineVisibilityResult.error,
      galleryVisibility: galleryVisibilityResult.error,
    });
  }

  return {
    data: {
      isPrivate: isPrivateResult.value,
      messagePrivacy: messagePrivacyResult.value,
      onlineVisibility: onlineVisibilityResult.value,
      galleryVisibility: galleryVisibilityResult.value,
    },
    error: null,
  };
}
