import { loadFollowRelationship } from "@/lib/follows";
import { supabase } from "@/lib/supabaseClient";

export type OnlineVisibility = "nobody" | "friends" | "everyone";

export const ONLINE_VISIBILITY_VALUES: OnlineVisibility[] = ["everyone", "friends", "nobody"];

export function isOnlineVisibility(value: string): value is OnlineVisibility {
  return ONLINE_VISIBILITY_VALUES.includes(value as OnlineVisibility);
}

export function normalizeOnlineVisibility(value: unknown): OnlineVisibility {
  const normalized = typeof value === "string" ? value : "";

  return isOnlineVisibility(normalized) ? normalized : "everyone";
}

/** Whether viewer may see target's online / last seen (sync — supply visibility + friendship). */
export function evaluateOnlineVisibility(
  viewerVisibility: OnlineVisibility,
  targetVisibility: OnlineVisibility,
  areMutualFriends: boolean
) {
  if (viewerVisibility === "nobody" || targetVisibility === "nobody") {
    return false;
  }

  if (viewerVisibility === "friends" && !areMutualFriends) {
    return false;
  }

  if (targetVisibility === "friends" && !areMutualFriends) {
    return false;
  }

  return true;
}

export async function loadProfileOnlineVisibility(userId: string): Promise<OnlineVisibility> {
  const { data, error } = await supabase
    .from("profiles")
    .select("online_visibility")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return "everyone";
    }

    console.error("[Online] failed to load online visibility:", error);
    return "everyone";
  }

  return normalizeOnlineVisibility(data?.online_visibility);
}

export async function saveProfileOnlineVisibility(userId: string, visibility: OnlineVisibility) {
  const { error } = await supabase
    .from("profiles")
    .update({ online_visibility: visibility })
    .eq("id", userId);

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  return { error: null as string | null };
}

/** Whether viewer may see target's online / last seen status. */
export async function canSeeOnlineStatus(viewerId: string, targetUserId: string) {
  if (!viewerId || !targetUserId) {
    return false;
  }

  if (viewerId === targetUserId) {
    return true;
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, online_visibility")
    .in("id", [viewerId, targetUserId]);

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return true;
    }

    console.error("[Online] canSeeOnlineStatus profile load failed", error);
    return false;
  }

  const viewerRow = profiles?.find((row) => row.id === viewerId);
  const targetRow = profiles?.find((row) => row.id === targetUserId);

  if (!viewerRow || !targetRow) {
    return false;
  }

  const viewerVisibility = normalizeOnlineVisibility(viewerRow.online_visibility);
  const targetVisibility = normalizeOnlineVisibility(targetRow.online_visibility);

  if (viewerVisibility === "nobody" || targetVisibility === "nobody") {
    return false;
  }

  if (viewerVisibility === "everyone" && targetVisibility === "everyone") {
    return true;
  }

  const { data: relationship, error: relationshipError } = await loadFollowRelationship(
    viewerId,
    targetUserId
  );

  if (relationshipError || !relationship) {
    return false;
  }

  return evaluateOnlineVisibility(
    viewerVisibility,
    targetVisibility,
    relationship.areFriends
  );
}
