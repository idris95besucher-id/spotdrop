import { supabase } from "@/lib/supabaseClient";

export type DmInboxPreference = {
  muted: boolean;
  hidden: boolean;
};

export type DmInboxPreferenceMap = Map<string, DmInboxPreference>;

function dmChatKey(partnerId: string) {
  return partnerId;
}

function isMissingPreferencesTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("chat_inbox_preferences") && message.includes("does not exist"))
  );
}

export async function loadDmInboxPreferences(userId: string) {
  const { data, error } = await supabase
    .from("chat_inbox_preferences")
    .select("chat_key, muted, hidden")
    .eq("user_id", userId)
    .eq("chat_type", "dm");

  if (error) {
    if (isMissingPreferencesTable(error)) {
      return { preferences: new Map<string, DmInboxPreference>(), error: null as string | null };
    }

    return { preferences: new Map<string, DmInboxPreference>(), error: error.message };
  }

  const preferences = new Map<string, DmInboxPreference>();

  for (const row of data ?? []) {
    preferences.set(String(row.chat_key), {
      muted: Boolean(row.muted),
      hidden: Boolean(row.hidden),
    });
  }

  return { preferences, error: null as string | null };
}

async function upsertDmPreference(
  userId: string,
  partnerId: string,
  patch: Partial<Pick<DmInboxPreference, "muted" | "hidden">>
) {
  const now = new Date().toISOString();

  const { error } = await supabase.from("chat_inbox_preferences").upsert(
    {
      user_id: userId,
      chat_type: "dm",
      chat_key: dmChatKey(partnerId),
      muted: patch.muted ?? false,
      hidden: patch.hidden ?? false,
      updated_at: now,
    },
    { onConflict: "user_id,chat_type,chat_key" }
  );

  if (error) {
    if (isMissingPreferencesTable(error)) {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function setDmMuted(userId: string, partnerId: string, muted: boolean) {
  const { preferences, error: loadError } = await loadDmInboxPreferences(userId);

  if (loadError) {
    return { error: loadError };
  }

  const existing = preferences.get(partnerId);

  return upsertDmPreference(userId, partnerId, {
    muted,
    hidden: existing?.hidden ?? false,
  });
}

export async function hideDmChat(userId: string, partnerId: string) {
  const { preferences, error: loadError } = await loadDmInboxPreferences(userId);

  if (loadError) {
    return { error: loadError };
  }

  const existing = preferences.get(partnerId);

  return upsertDmPreference(userId, partnerId, {
    muted: existing?.muted ?? false,
    hidden: true,
  });
}

export async function loadMutedDmPartnerIds(userId: string) {
  const { preferences, error } = await loadDmInboxPreferences(userId);

  if (error) {
    return { partnerIds: new Set<string>(), error };
  }

  const partnerIds = new Set<string>();

  for (const [partnerId, preference] of preferences) {
    if (preference.muted) {
      partnerIds.add(partnerId);
    }
  }

  return { partnerIds, error: null as string | null };
}

export async function isDmMuted(userId: string, partnerId: string) {
  const { preferences, error } = await loadDmInboxPreferences(userId);

  if (error) {
    return false;
  }

  return preferences.get(partnerId)?.muted ?? false;
}
