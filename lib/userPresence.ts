import type { TranslationKey } from "@/lib/i18n/messages";
import { auditPresenceUpdate, type PresenceUpdateAudit } from "@/lib/presenceUpdateDiagnostics";
import { supabase } from "@/lib/supabaseClient";

/** Heartbeat interval while app is active (30–45s). */
export const PRESENCE_HEARTBEAT_MS = 45 * 1000;

/** User is online when last_seen_at is within this window (unless Realtime Presence says otherwise). */
export const PRESENCE_ONLINE_FRESH_MS = 90 * 1000;

/** @deprecated Use PRESENCE_ONLINE_FRESH_MS */
export const PRESENCE_DM_ONLINE_MS = PRESENCE_ONLINE_FRESH_MS;

/** @deprecated Use PRESENCE_ONLINE_FRESH_MS */
export const PRESENCE_DM_FRESH_MS = PRESENCE_ONLINE_FRESH_MS;

/** DM header "Last seen recently" window when offline. */
export const PRESENCE_DM_RECENT_MS = 10 * 60 * 1000;

/** Delay before writing is_online=false after confirmed background (not iOS noise). */
export const PRESENCE_SAFE_OFFLINE_MS = 3 * 60 * 1000;

/** Offline but still "recently" active — inbox/profile only. */
export const PRESENCE_RECENT_MS = 15 * 60 * 1000;

/** DB fallback when Realtime Presence is unavailable — inbox/profile only. */
export const PRESENCE_ONLINE_MS = PRESENCE_ONLINE_FRESH_MS;

/** Re-evaluate relative last-seen labels in DM header. */
export const PRESENCE_DM_DISPLAY_TICK_MS = 30 * 1000;

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export type DmPartnerPresenceStatus = {
  userId?: string | null;
  username?: string | null;
  rawIsOnline?: boolean | null;
  presenceOnline?: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
};

export type IsOnlineNowInput = {
  presenceOnline?: boolean;
  isOnlineFlag?: unknown;
  /** @deprecated Prefer isOnlineFlag */
  rawIsOnline?: unknown;
  lastSeenAt?: string | null;
  screen?: string;
  userId?: string | null;
  username?: string | null;
  now?: number;
};

export type ComputeUserIsOnlineInput = IsOnlineNowInput;

export function isLastSeenFresh(
  lastSeenAt: string | null | undefined,
  now = Date.now()
) {
  const parsed = parseLastSeenAt(lastSeenAt);

  if (parsed === null) {
    return false;
  }

  return now - parsed <= PRESENCE_ONLINE_FRESH_MS;
}

/** Single source of truth for online UI — never trust stale profiles.is_online alone. */
export function isOnlineNow(input: IsOnlineNowInput) {
  const now = input.now ?? Date.now();
  const isFresh = isLastSeenFresh(input.lastSeenAt, now);
  const presenceOnline = Boolean(input.presenceOnline);
  const computedIsOnline = presenceOnline || isFresh;
  const rawIsOnline = readRawIsOnline(input.isOnlineFlag ?? input.rawIsOnline);

  console.log("[Online UI] computed status", {
    screen: input.screen ?? "unknown",
    userId: input.userId ?? null,
    username: input.username ?? null,
    rawIsOnline,
    lastSeenAt: input.lastSeenAt ?? null,
    presenceOnline,
    isFresh,
    computedIsOnline,
  });

  return computedIsOnline;
}

/** @deprecated Prefer isOnlineNow */
export function computeUserIsOnline(input: ComputeUserIsOnlineInput) {
  return isOnlineNow(input);
}

/** Resolve online from DB row + optional Realtime Presence (never is_online alone). */
export function resolveProfileIsOnline(
  rawIsOnline: unknown,
  lastSeenAt: string | null | undefined,
  options: Omit<IsOnlineNowInput, "isOnlineFlag" | "rawIsOnline" | "lastSeenAt"> = {}
) {
  return isOnlineNow({
    ...options,
    isOnlineFlag: rawIsOnline,
    lastSeenAt,
  });
}

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

function presenceFromRow(row: PartnerPresenceRow | null, screen = "profile-fetch") {
  const lastSeenAt = (row?.last_seen_at as string | null) ?? null;
  const rawIsOnline = row?.is_online ?? null;
  const userId = (row?.id as string | null) ?? null;
  const username = (row?.username as string | null) ?? null;

  return {
    profileId: userId,
    username,
    name: (row?.name as string | null) ?? null,
    rawIsOnline,
    lastSeenAt,
    isOnline: resolveProfileIsOnline(rawIsOnline, lastSeenAt, {
      screen,
      userId,
      username,
    }),
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
      rawIsOnline: null as boolean | null,
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
    rawIsOnline: resolved.rawIsOnline,
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

export function isUserOnline(
  lastSeenAt: string | null | undefined,
  now = Date.now(),
  options: Omit<IsOnlineNowInput, "lastSeenAt" | "now"> = {}
) {
  return isOnlineNow({
    ...options,
    lastSeenAt,
    now,
    screen: options.screen ?? "isUserOnline",
  });
}

/** @deprecated Use isLastSeenFresh or computeUserIsOnline */
export function isDmPartnerOnline(
  lastSeenAt: string | null | undefined,
  now = Date.now()
) {
  return isLastSeenFresh(lastSeenAt, now);
}

/** @deprecated Use isOnlineNow */
export function isPartnerOnlineForDm(
  presenceOnline: boolean,
  profileIsOnline: boolean,
  lastSeenAt: string | null | undefined,
  now = Date.now()
) {
  return isOnlineNow({
    presenceOnline,
    isOnlineFlag: profileIsOnline,
    lastSeenAt,
    now,
    screen: "dm-partner-legacy",
  });
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

/** DM header — green dot + Online, or formatted last seen. */
export function formatDmHeaderPresenceLabel(
  status: DmPartnerPresenceStatus,
  t: TranslateFn,
  now = Date.now()
) {
  const parsed = parseLastSeenAt(status.lastSeenAt);
  const isOnline =
    status.isOnline ??
    isOnlineNow({
      screen: "dm-header-label",
      userId: status.userId,
      username: status.username,
      isOnlineFlag: status.rawIsOnline,
      lastSeenAt: status.lastSeenAt,
      presenceOnline: status.presenceOnline,
      now,
    });

  if (isOnline) {
    return { isOnline: true as const, label: t("common.online") };
  }

  if (parsed === null) {
    return { isOnline: false as const, label: t("presence.statusUnknown") };
  }

  const ageMs = now - parsed;
  const seenDate = new Date(parsed);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);

  if (ageMs <= PRESENCE_DM_RECENT_MS) {
    return { isOnline: false as const, label: t("presence.lastSeenRecently") };
  }

  if (sameCalendarDay(seenDate, today)) {
    return {
      isOnline: false as const,
      label: t("presence.lastSeen", { time: formatDmTimeHHmm(seenDate) }),
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
  locale?: string,
  options: {
    isOnline?: boolean;
    userId?: string | null;
    username?: string | null;
    rawIsOnline?: unknown;
    isOnlineFlag?: unknown;
    presenceOnline?: boolean;
    screen?: string;
  } = {}
) {
  const isOnline =
    options.isOnline ??
    isOnlineNow({
      screen: options.screen ?? "presence-label",
      userId: options.userId,
      username: options.username,
      isOnlineFlag: options.isOnlineFlag ?? options.rawIsOnline,
      lastSeenAt,
      presenceOnline: options.presenceOnline,
    });

  if (isOnline) {
    return { isOnline: true as const, label: t("common.online") };
  }

  const parsed = parseLastSeenAt(lastSeenAt);

  if (parsed === null) {
    return { isOnline: false as const, label: null };
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
