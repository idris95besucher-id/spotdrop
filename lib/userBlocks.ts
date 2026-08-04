import { loadUserSettingsPreferences, updateUserSettingsPreferences } from "@/lib/settingsPreferences";
import { supabase } from "@/lib/supabaseClient";

function isMissingUserBlocksTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("user_blocks") && message.includes("does not exist"))
  );
}

/** True if either user has blocked the other. */
export async function areUsersBlocked(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) {
    return false;
  }

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`
    )
    .limit(1);

  if (error) {
    if (isMissingUserBlocksTable(error)) {
      // Table not migrated yet — cannot enforce server blocks.
      return false;
    }

    console.error("[userBlocks] areUsersBlocked failed", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/** IDs the viewer has blocked (blocker = viewer). */
export async function loadBlockedUserIds(blockerId: string): Promise<string[]> {
  if (!blockerId) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingUserBlocksTable(error)) {
      return loadUserSettingsPreferences().blockedUserIds;
    }

    console.error("[userBlocks] loadBlockedUserIds failed", error.message);
    return loadUserSettingsPreferences().blockedUserIds;
  }

  const ids = (data ?? []).map((row) => String(row.blocked_id));

  // Keep local prefs in sync for screens that still read localStorage.
  updateUserSettingsPreferences({ blockedUserIds: ids });
  return ids;
}

/**
 * Migrate any leftover localStorage blocks into user_blocks once, then return
 * the server list as source of truth.
 */
export async function syncLocalBlocksToServer(blockerId: string): Promise<string[]> {
  const localIds = loadUserSettingsPreferences().blockedUserIds.filter(Boolean);

  if (localIds.length > 0) {
    const rows = localIds
      .filter((id) => id !== blockerId)
      .map((blockedId) => ({
        blocker_id: blockerId,
        blocked_id: blockedId,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("user_blocks").upsert(rows, {
        onConflict: "blocker_id,blocked_id",
        ignoreDuplicates: true,
      });

      if (error && !isMissingUserBlocksTable(error)) {
        console.error("[userBlocks] syncLocalBlocksToServer failed", error.message);
      }
    }
  }

  return loadBlockedUserIds(blockerId);
}

export async function blockUser(blockerId: string, blockedId: string): Promise<{ error: string | null }> {
  if (!blockerId || !blockedId || blockerId === blockedId) {
    return { error: "Unable to block this user." };
  }

  const { error } = await supabase.from("user_blocks").upsert(
    { blocker_id: blockerId, blocked_id: blockedId },
    { onConflict: "blocker_id,blocked_id" }
  );

  if (error) {
    if (isMissingUserBlocksTable(error)) {
      const current = loadUserSettingsPreferences();
      if (!current.blockedUserIds.includes(blockedId)) {
        updateUserSettingsPreferences({
          blockedUserIds: [...current.blockedUserIds, blockedId],
        });
      }
      return { error: null };
    }

    return { error: error.message };
  }

  const current = loadUserSettingsPreferences();
  if (!current.blockedUserIds.includes(blockedId)) {
    updateUserSettingsPreferences({
      blockedUserIds: [...current.blockedUserIds, blockedId],
    });
  }

  return { error: null };
}

export async function unblockUserOnServer(
  blockerId: string,
  blockedId: string
): Promise<{ error: string | null }> {
  if (!blockerId || !blockedId) {
    return { error: "Unable to unblock this user." };
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);

  if (error) {
    if (isMissingUserBlocksTable(error)) {
      const current = loadUserSettingsPreferences();
      updateUserSettingsPreferences({
        blockedUserIds: current.blockedUserIds.filter((id) => id !== blockedId),
      });
      return { error: null };
    }

    return { error: error.message };
  }

  const current = loadUserSettingsPreferences();
  updateUserSettingsPreferences({
    blockedUserIds: current.blockedUserIds.filter((id) => id !== blockedId),
  });

  return { error: null };
}
