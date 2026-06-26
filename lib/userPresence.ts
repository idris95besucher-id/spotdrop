import type { TranslationKey } from "@/lib/i18n/messages";
import { auditPresenceUpdate, type PresenceUpdateAudit } from "@/lib/presenceUpdateDiagnostics";
import { supabase } from "@/lib/supabaseClient";

/** Heartbeat interval while app is active (30–45s). */
export const PRESENCE_HEARTBEAT_MS = 45 * 1000;

/** DM header treats partner as online when last_seen_at is this fresh. */
export const PRESENCE_DM_FRESH_MS = 90 * 1000;

/** Delay before writing is_online=false after confirmed background (not iOS noise). */
export const PRESENCE_SAFE_OFFLINE_MS = 3 * 60 * 1000;

/** Offline but still "recently" active — inbox/profile only. */
export const PRESENCE_RECENT_MS = 15 * 60 * 1000;

/** DB fallback when Realtime Presence is unavailable. */
export const PRESENCE_ONLINE_MS = 2 * 60 * 1000;

/** Re-evaluate relative last-seen labels in DM header. */
export const PRESENCE_DM_DISPLAY_TICK_MS = 30 * 1000;

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export type DmPartnerPresenceStatus = {
  isOnline: boolean;
  lastSeenAt: string | null;
};

export function isProfileUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

type PartnerPresenceRow = {
  id?: string;
  username?: string | null;
  name?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

function readRawIsOnline(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "true" || value === "t") {
    return true;
  }

  if (value === false || value === 0 || value === "false" || value === "f") {
    return false;
  }

  return null;
}

/** Resolve is_online from DB flag and/or fresh last_seen_at heartbeat. */
export function resolveProfileIsOnline(
  rawIsOnline: unknown,
  lastSeenAt: string | null | undefined
) {
  if (readRawIsOnline(rawIsOnline) === true) {
    return true;
  }

  return isPartnerOnlineForDm(false, false, lastSeenAt);
}

function presenceFromRow(row: PartnerPresenceRow | null) {
  const lastSeenAt = (row?.last_seen_at as string | null) ?? null;
  const rawIsOnline = row?.is_online ?? null;

  return {
    profileId: (row?.id as string | null) ?? null,
    username: (row?.username as string | null) ?? null,
    name: (row?.name as string | null) ?? null,
    rawIsOnline,
    lastSeenAt,
    isOnline: resolveProfileIsOnline(rawIsOnline, lastSeenAt),
  };
}

export async function fetchPartnerProfilePresenceDirect(
  partnerId: string,
  partnerUsername?: string | null
) {
  const trimmedPartnerId = partnerId.trim();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, name, is_online, last_seen_at")
    .eq("id", trimmedPartnerId)
    .maybeSingle();

  if (error) {
    console.error("[Online] direct partner profile fetch", {
      partnerId: trimmedPartnerId,
      rowFound: false,
      username: null,
      name: null,
      rawIsOnline: null,
      lastSeenAt: null,
      error: error.message,
      code: error.code ?? null,
    });

    console.log("[DM DEBUG] fetchUserPresenceStatus result", {
      profileId: null,
      username: null,
      rawIsOnline: null,
      lastSeenAt: null,
    });

    return {
      profileId: null as string | null,
      isOnline: false,
      lastSeenAt: null as string | null,
      error: error.message,
    };
  }

  let resolved = presenceFromRow(data as PartnerPresenceRow | null);

  console.log("[Online] direct partner profile fetch", {
    partnerId: trimmedPartnerId,
    rowFound: data !== null,
    username: resolved.username,
    name: resolved.name,
    rawIsOnline: resolved.rawIsOnline,
    lastSeenAt: resolved.lastSeenAt,
    resolvedIsOnline: resolved.isOnline,
  });

  const normalizedUsername = partnerUsername?.trim().toLowerCase() ?? resolved.username?.trim().toLowerCase() ?? null;

  if (normalizedUsername) {
    const { data: usernameRow, error: usernameError } = await supabase
      .from("profiles")
      .select("id, username, name, is_online, last_seen_at")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (usernameError) {
      console.warn("[Online] direct partner profile fetch username lookup failed", {
        partnerId: trimmedPartnerId,
        username: normalizedUsername,
        error: usernameError.message,
      });
    } else if (usernameRow) {
      const usernamePresence = presenceFromRow(usernameRow as PartnerPresenceRow);

      console.log("[Online] direct partner profile fetch username lookup", {
        routePartnerId: trimmedPartnerId,
        usernameProfileId: usernamePresence.profileId,
        username: usernamePresence.username,
        rawIsOnline: usernamePresence.rawIsOnline,
        lastSeenAt: usernamePresence.lastSeenAt,
        resolvedIsOnline: usernamePresence.isOnline,
        idMatchesRoute: usernamePresence.profileId === trimmedPartnerId,
      });

      if (usernamePresence.profileId && usernamePresence.profileId !== trimmedPartnerId) {
        console.warn("[Online] partner id mismatch — using username profile row for presence", {
          routePartnerId: trimmedPartnerId,
          usernameProfileId: usernamePresence.profileId,
          username: usernamePresence.username,
        });
        resolved = usernamePresence;
      } else if (!resolved.isOnline && usernamePresence.isOnline) {
        resolved = usernamePresence;
      }
    }
  }

  console.log("[Online] fetchUserPresenceStatus result", {
    userId: trimmedPartnerId,
    profileId: resolved.profileId,
    is_online: resolved.rawIsOnline,
    last_seen_at: resolved.lastSeenAt,
    isOnline: resolved.isOnline,
    rowFound: data !== null,
    error: null,
  });

  console.log("[DM DEBUG] fetchUserPresenceStatus result", {
    profileId: resolved.profileId,
    username: resolved.username,
    rawIsOnline: resolved.rawIsOnline,
    lastSeenAt: resolved.lastSeenAt,
  });

  return {
    profileId: resolved.profileId,
    isOnline: resolved.isOnline,
    lastSeenAt: resolved.lastSeenAt,
    error: null as string | null,
  };
}

export type PresenceUpdateResult = {
  lastSeenAt: string | null;
  error: string | null;
  audit: PresenceUpdateAudit | null;
};

function auditToResult(audit: PresenceUpdateAudit): PresenceUpdateResult {
  if (audit.failureCause) {
    const detail =
      audit.updateError?.message ??
      audit.failureCause.replaceAll("_", " ");

    return {
      lastSeenAt: null,
      error: detail,
      audit,
    };
  }

  const row = audit.profileAfter ?? (Array.isArray(audit.updateData) ? audit.updateData[0] : null);

  return {
    lastSeenAt: (row?.last_seen_at as string | null) ?? audit.updatePayload?.last_seen_at ?? null,
    error: null,
    audit,
  };
}

export function parseLastSeenAt(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) {
    return null;
  }

  const parsed = Date.parse(lastSeenAt);

  return Number.isNaN(parsed) ? null : parsed;
}

export function isUserOnline(lastSeenAt: string | null | undefined, now = Date.now()) {
  const parsed = parseLastSeenAt(lastSeenAt);

  if (parsed === null) {
    return false;
  }

  return now - parsed <= PRESENCE_ONLINE_MS;
}

/** DM header — Realtime Presence, DB is_online, or fresh last_seen_at. */
export function isPartnerOnlineForDm(
  presenceOnline: boolean,
  profileIsOnline: boolean,
  lastSeenAt: string | null | undefined,
  now = Date.now()
) {
  if (presenceOnline || profileIsOnline) {
    return true;
  }

  const parsed = parseLastSeenAt(lastSeenAt);

  if (parsed === null) {
    return false;
  }

  return now - parsed <= PRESENCE_DM_FRESH_MS;
}

function sameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDmTimeHHmm(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDmDateDDMMYYYY(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatLastSeenTime(lastSeenAt: string, locale?: string) {
  const date = new Date(lastSeenAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** DM header — online dot or relative / formatted last seen. No vague "recently" fallback. */
export function formatDmHeaderPresenceLabel(
  status: DmPartnerPresenceStatus,
  t: TranslateFn,
  now = Date.now()
) {
  if (status.isOnline) {
    return { isOnline: true as const, label: t("common.online") };
  }

  const parsed = parseLastSeenAt(status.lastSeenAt);

  if (parsed === null) {
    return { isOnline: false as const, label: t("presence.statusUnknown") };
  }

  const ageMs = now - parsed;
  const minutes = Math.floor(ageMs / 60_000);
  const hours = Math.floor(ageMs / 3_600_000);
  const seenDate = new Date(parsed);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);

  if (minutes < 1) {
    return { isOnline: false as const, label: t("presence.lastSeenJustNow") };
  }

  if (minutes < 60) {
    return {
      isOnline: false as const,
      label: t("presence.lastSeenMinutesAgo", { count: minutes }),
    };
  }

  if (hours < 24 && sameCalendarDay(seenDate, today)) {
    return {
      isOnline: false as const,
      label: t("presence.lastSeenHoursAgo", { count: hours }),
    };
  }

  if (sameCalendarDay(seenDate, yesterday)) {
    return {
      isOnline: false as const,
      label: t("presence.lastSeenYesterday", { time: formatDmTimeHHmm(seenDate) }),
    };
  }

  return {
    isOnline: false as const,
    label: t("presence.lastSeenDate", { date: formatDmDateDDMMYYYY(seenDate) }),
  };
}

export function formatUserPresenceLabel(
  lastSeenAt: string | null | undefined,
  t: TranslateFn,
  locale?: string
) {
  if (isUserOnline(lastSeenAt)) {
    return { isOnline: true as const, label: t("common.online") };
  }

  const parsed = parseLastSeenAt(lastSeenAt);

  if (parsed === null) {
    return { isOnline: false as const, label: t("presence.lastSeenRecently") };
  }

  const age = Date.now() - parsed;

  if (age <= PRESENCE_RECENT_MS) {
    return { isOnline: false as const, label: t("presence.lastSeenRecently") };
  }

  const time = formatLastSeenTime(lastSeenAt!, locale);

  return {
    isOnline: false as const,
    label: time ? t("presence.lastSeen", { time }) : t("presence.lastSeenRecently"),
  };
}

export async function setUserOnline(userId: string, context: string | null = null) {
  const audit = await auditPresenceUpdate(userId, true, context);
  return auditToResult(audit);
}

export async function setUserOffline(userId: string, context: string | null = null) {
  const audit = await auditPresenceUpdate(userId, false, context);
  return auditToResult(audit);
}

/** @deprecated Use setUserOnline */
export async function pingUserPresence(userId: string) {
  return setUserOnline(userId, "pingUserPresence");
}

export async function fetchUserPresenceStatus(
  userId: string,
  partnerUsername?: string | null
) {
  return fetchPartnerProfilePresenceDirect(userId, partnerUsername);
}

/** @deprecated Use fetchUserPresenceStatus */
export async function fetchUserLastSeenAt(userId: string) {
  const result = await fetchUserPresenceStatus(userId);
  return { lastSeenAt: result.lastSeenAt, error: result.error };
}
