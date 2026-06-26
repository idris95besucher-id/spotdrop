import { supabase } from "@/lib/supabaseClient";

export type PresenceFailureCause =
  | "not_called"
  | "no_session"
  | "no_access_token"
  | "auth_get_user_failed"
  | "auth_user_missing"
  | "session_user_mismatch"
  | "profile_select_failed"
  | "profile_row_missing"
  | "update_error"
  | "update_zero_rows_rls"
  | "update_succeeded_but_verify_mismatch"
  | "unknown";

export type PresenceUpdateAudit = {
  step: string;
  userId: string;
  isOnline: boolean;
  context: string | null;
  authUserId: string | null;
  hasSession: boolean;
  hasAccessToken: boolean;
  accessTokenExpiresAt: number | null;
  profileExistsBefore: boolean;
  profileBefore: { id: string; is_online: boolean | null; last_seen_at: string | null } | null;
  updatePayload: { is_online: boolean; last_seen_at: string } | null;
  updateStatus: number | null;
  updateCount: number;
  updateData: unknown;
  updateError: {
    message: string;
    code: string | null;
    details: string | null;
    hint: string | null;
  } | null;
  profileAfter: { id: string; is_online: boolean | null; last_seen_at: string | null } | null;
  failureCause: PresenceFailureCause | null;
  rlsFixSql: string | null;
};

const RLS_FIX_SQL = `-- Fix: allow authenticated users to UPDATE their own profiles row (presence fields).
alter table if exists public.profiles enable row level security;

drop policy if exists "Users can update own presence" on public.profiles;

create policy "Users can update own presence"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Ensure the generic self-update policy also exists (safe to re-run).
drop policy if exists "Allow profile update" on public.profiles;

create policy "Allow profile update"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

notify pgrst, 'reload schema';`;

function serializeSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null) {
  if (!error) {
    return null;
  }

  return {
    message: error.message ?? "unknown error",
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

function logAudit(audit: PresenceUpdateAudit) {
  const payload = {
    step: audit.step,
    userId: audit.userId,
    isOnline: audit.isOnline,
    context: audit.context,
    authUserId: audit.authUserId,
    hasSession: audit.hasSession,
    hasAccessToken: audit.hasAccessToken,
    accessTokenExpiresAt: audit.accessTokenExpiresAt,
    profileExistsBefore: audit.profileExistsBefore,
    profileBefore: audit.profileBefore,
    updatePayload: audit.updatePayload,
    updateStatus: audit.updateStatus,
    updateCount: audit.updateCount,
    updateData: audit.updateData,
    updateError: audit.updateError,
    profileAfter: audit.profileAfter,
    failureCause: audit.failureCause,
    rlsFixSql: audit.rlsFixSql,
  };

  if (audit.failureCause) {
    console.error("[Online] presence update audit — FAILED", payload);
    if (audit.rlsFixSql) {
      console.error("[Online] RLS fix SQL (paste into Supabase SQL Editor):\n", audit.rlsFixSql);
    }
    return;
  }

  console.log("[Online] presence update audit — OK", payload);
}

export async function auditPresenceUpdate(
  userId: string,
  isOnline: boolean,
  context: string | null = null
): Promise<PresenceUpdateAudit> {
  const audit: PresenceUpdateAudit = {
    step: "start",
    userId,
    isOnline,
    context,
    authUserId: null,
    hasSession: false,
    hasAccessToken: false,
    accessTokenExpiresAt: null,
    profileExistsBefore: false,
    profileBefore: null,
    updatePayload: null,
    updateStatus: null,
    updateCount: 0,
    updateData: null,
    updateError: null,
    profileAfter: null,
    failureCause: null,
    rlsFixSql: null,
  };

  console.log(`[Online] ${isOnline ? "setUserOnline" : "setUserOffline"} called`, {
    userId,
    isOnline,
    context,
  });

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  audit.hasSession = Boolean(sessionData.session);
  audit.hasAccessToken = Boolean(sessionData.session?.access_token);
  audit.accessTokenExpiresAt = sessionData.session?.expires_at ?? null;

  console.log("[Online] auth.getSession()", {
    userId,
    hasSession: audit.hasSession,
    hasAccessToken: audit.hasAccessToken,
    accessTokenExpiresAt: audit.accessTokenExpiresAt,
    sessionError: sessionError?.message ?? null,
  });

  if (sessionError) {
    audit.step = "auth.getSession";
    audit.failureCause = "no_session";
    logAudit(audit);
    return audit;
  }

  if (!sessionData.session?.access_token) {
    audit.step = "auth.getSession";
    audit.failureCause = "no_access_token";
    logAudit(audit);
    return audit;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  audit.authUserId = userData.user?.id ?? null;

  console.log("[Online] auth.getUser()", {
    expectedUserId: userId,
    authUserId: audit.authUserId,
    error: serializeSupabaseError(userError),
  });

  if (userError) {
    audit.step = "auth.getUser";
    audit.updateError = serializeSupabaseError(userError);
    audit.failureCause = "auth_get_user_failed";
    logAudit(audit);
    return audit;
  }

  if (!userData.user) {
    audit.step = "auth.getUser";
    audit.failureCause = "auth_user_missing";
    logAudit(audit);
    return audit;
  }

  if (userData.user.id !== userId) {
    audit.step = "auth.getUser";
    audit.failureCause = "session_user_mismatch";
    logAudit(audit);
    return audit;
  }

  const { data: profileBefore, error: profileBeforeError } = await supabase
    .from("profiles")
    .select("id, is_online, last_seen_at")
    .eq("id", userId)
    .maybeSingle();

  console.log("[Online] profile lookup before UPDATE", {
    userId,
    profileBefore,
    error: serializeSupabaseError(profileBeforeError),
  });

  if (profileBeforeError) {
    audit.step = "profile.select.before";
    audit.updateError = serializeSupabaseError(profileBeforeError);
    audit.failureCause = "profile_select_failed";
    logAudit(audit);
    return audit;
  }

  if (!profileBefore?.id) {
    audit.step = "profile.select.before";
    audit.profileExistsBefore = false;
    audit.failureCause = "profile_row_missing";
    logAudit(audit);
    return audit;
  }

  audit.profileExistsBefore = true;
  audit.profileBefore = {
    id: profileBefore.id,
    is_online: (profileBefore.is_online as boolean | null) ?? null,
    last_seen_at: (profileBefore.last_seen_at as string | null) ?? null,
  };

  const lastSeenAt = new Date().toISOString();
  audit.updatePayload = { is_online: isOnline, last_seen_at: lastSeenAt };

  if (isOnline) {
    console.log("[Online] UPDATE public.profiles with is_online = true", {
      userId,
      context,
      filter: { id: userId },
      set: audit.updatePayload,
    });
  }

  console.log("[Online] UPDATE public.profiles", {
    userId,
    filter: { id: userId },
    set: audit.updatePayload,
  });

  const updateResponse = await supabase
    .from("profiles")
    .update(audit.updatePayload)
    .eq("id", userId)
    .select("id, is_online, last_seen_at");

  audit.updateStatus = updateResponse.status;
  audit.updateCount = updateResponse.data?.length ?? 0;
  audit.updateData = updateResponse.data ?? null;
  audit.updateError = serializeSupabaseError(updateResponse.error);

  console.log("[Online] UPDATE result", {
    userId,
    status: audit.updateStatus,
    rowCount: audit.updateCount,
    data: audit.updateData,
    error: audit.updateError,
    zeroRowsUpdated: audit.updateCount === 0 && !audit.updateError,
  });

  if (audit.updateError) {
    audit.step = "profile.update";
    audit.failureCause = "update_error";
    logAudit(audit);
    return audit;
  }

  if (audit.updateCount === 0) {
    audit.step = "profile.update";
    audit.failureCause = "update_zero_rows_rls";
    audit.rlsFixSql = RLS_FIX_SQL;
    logAudit(audit);
    return audit;
  }

  const { data: profileAfter, error: profileAfterError } = await supabase
    .from("profiles")
    .select("id, is_online, last_seen_at")
    .eq("id", userId)
    .maybeSingle();

  console.log("[Online] profile lookup after UPDATE (verify)", {
    userId,
    profileAfter,
    error: serializeSupabaseError(profileAfterError),
  });

  if (profileAfter?.id) {
    audit.profileAfter = {
      id: profileAfter.id,
      is_online: (profileAfter.is_online as boolean | null) ?? null,
      last_seen_at: (profileAfter.last_seen_at as string | null) ?? null,
    };
  }

  const returnedRow = Array.isArray(updateResponse.data) ? updateResponse.data[0] : null;
  const returnedIsOnline = returnedRow?.is_online;

  if (returnedIsOnline !== isOnline || audit.profileAfter?.is_online !== isOnline) {
    audit.step = "profile.verify.after";
    audit.failureCause = "update_succeeded_but_verify_mismatch";
    logAudit(audit);
    return audit;
  }

  audit.step = "complete";
  logAudit(audit);
  return audit;
}
