import { publicProfileUsername } from "@/lib/publicProfile";
import { isOnlineNow } from "@/lib/userPresence";
import { supabase } from "@/lib/supabaseClient";

export const LIVE_LOCATION_STALE_MS = 10 * 60 * 1000;
export const LIVE_LOCATION_PUSH_MS = 15 * 1000;

export const LIVE_LOCATION_ERROR = {
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  TABLE_MISSING: "TABLE_MISSING",
  SAVE_FAILED: "SAVE_FAILED",
  LOAD_FAILED: "LOAD_FAILED",
  INVALID_COORDS: "INVALID_COORDS",
} as const;

export type LiveLocationErrorCode =
  | typeof LIVE_LOCATION_ERROR.NOT_AUTHENTICATED
  | typeof LIVE_LOCATION_ERROR.TABLE_MISSING
  | typeof LIVE_LOCATION_ERROR.SAVE_FAILED
  | typeof LIVE_LOCATION_ERROR.LOAD_FAILED
  | typeof LIVE_LOCATION_ERROR.INVALID_COORDS
  | string;

export type LiveLocationResult = {
  error: string | null;
};

export type UserLiveLocationRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  is_live: boolean;
  updated_at: string;
};

export type LiveMapUser = UserLiveLocationRow & {
  username: string;
  avatar_url: string | null;
  is_online: boolean | null;
  last_seen_at: string | null;
  is_verified: boolean | null;
};

type ProfileJoin = {
  username: string;
  avatar_url: string | null;
  is_online: boolean | null;
  last_seen_at: string | null;
  is_verified: boolean | null;
};

export function isLiveMapUserOnlineNow(
  user: Pick<LiveMapUser, "user_id" | "username" | "is_online" | "last_seen_at">,
  presenceOnlineIds: ReadonlySet<string>,
  screen: string
) {
  return isOnlineNow({
    screen,
    userId: user.user_id,
    username: user.username,
    isOnlineFlag: user.is_online,
    lastSeenAt: user.last_seen_at,
    presenceOnline: presenceOnlineIds.has(user.user_id),
  });
}

export function filterOnlineLiveMapUsers(
  users: LiveMapUser[],
  presenceOnlineIds: ReadonlySet<string>,
  screen: string
) {
  return users.filter((user) => isLiveMapUserOnlineNow(user, presenceOnlineIds, screen));
}

function liveLocationCutoffIso() {
  return new Date(Date.now() - LIVE_LOCATION_STALE_MS).toISOString();
}

function logLiveLocationIssue(
  context: string,
  error: { code?: string; message?: string; details?: string; hint?: string } | null,
  extra?: Record<string, unknown>
) {
  console.error(`[live-location] ${context}`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    ...extra,
  });
}

export function formatLiveLocationSupabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  const parts = [
    error.code ? `[${error.code}]` : null,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean);
  return parts.join(" — ") || "Unknown database error";
}

function isMissingLiveLocationsTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("user_live_locations") && message.includes("does not exist"))
  );
}

export function validateLiveCoordinates(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return `Invalid coordinates received (latitude=${String(latitude)}, longitude=${String(longitude)}).`;
  }

  if (latitude < -90 || latitude > 90) {
    return `Latitude out of range: ${latitude}. Expected -90 to 90.`;
  }

  if (longitude < -180 || longitude > 180) {
    return `Longitude out of range: ${longitude}. Expected -180 to 180.`;
  }

  return null;
}

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (user) {
    return { user, error: null as string | null };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (session?.user) {
    return { user: session.user, error: null as string | null };
  }

  const authMessage = error?.message ?? sessionError?.message ?? LIVE_LOCATION_ERROR.NOT_AUTHENTICATED;
  logLiveLocationIssue("auth", { message: authMessage });
  return { user: null, error: authMessage };
}

export async function fetchLiveMapUsers(): Promise<{
  users: LiveMapUser[];
  error: string | null;
}> {
  const { user, error: userError } = await getAuthenticatedUser();

  if (!user) {
    return { users: [], error: userError ?? LIVE_LOCATION_ERROR.NOT_AUTHENTICATED };
  }

  const { data, error } = await supabase
    .from("user_live_locations")
    .select(
      "user_id, latitude, longitude, city, country, is_live, updated_at, profiles(username, avatar_url, is_online, last_seen_at, is_verified)"
    )
    .eq("is_live", true)
    .gte("updated_at", liveLocationCutoffIso());

  if (error) {
    if (isMissingLiveLocationsTable(error)) {
      logLiveLocationIssue("fetchLiveMapUsers:table-missing", error);
      return { users: [], error: null };
    }

    logLiveLocationIssue("fetchLiveMapUsers", error);
    return { users: [], error: formatLiveLocationSupabaseError(error) };
  }

  const users: LiveMapUser[] = [];

  for (const row of data ?? []) {
    const profile = row.profiles as ProfileJoin | ProfileJoin[] | null;
    const profileRow = Array.isArray(profile) ? profile[0] : profile;

    if (!profileRow?.username) {
      continue;
    }

    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const coordError = validateLiveCoordinates(latitude, longitude);

    if (coordError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Map Marker] invalid coordinates (live-user)", {
          id: String(row.user_id),
          latitude: row.latitude,
          longitude: row.longitude,
          reason: coordError,
        });
      }
      continue;
    }

    if (latitude === 0 && longitude === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Map Marker] invalid coordinates (live-user)", {
          id: String(row.user_id),
          latitude,
          longitude,
          reason: "null_island_0_0",
        });
      }
      continue;
    }

    users.push({
      user_id: String(row.user_id),
      latitude,
      longitude,
      city: (row.city as string | null) ?? null,
      country: (row.country as string | null) ?? null,
      is_live: Boolean(row.is_live),
      updated_at: String(row.updated_at),
      username: publicProfileUsername(profileRow.username),
      avatar_url: (profileRow.avatar_url as string | null) ?? null,
      is_online: (profileRow.is_online as boolean | null) ?? null,
      last_seen_at: (profileRow.last_seen_at as string | null) ?? null,
      is_verified: (profileRow.is_verified as boolean | null) ?? null,
    });
  }

  return { users, error: null };
}

export async function upsertUserLiveLocation(input: {
  latitude: number;
  longitude: number;
  isLive: boolean;
}): Promise<LiveLocationResult> {
  const coordError = validateLiveCoordinates(input.latitude, input.longitude);

  if (coordError) {
    logLiveLocationIssue("upsert:invalid-coords", { message: coordError }, {
      latitude: input.latitude,
      longitude: input.longitude,
      isLive: input.isLive,
    });
    return { error: coordError };
  }

  const { user, error: userError } = await getAuthenticatedUser();

  if (!user) {
    return { error: userError ?? LIVE_LOCATION_ERROR.NOT_AUTHENTICATED };
  }

  const payload = {
    user_id: user.id,
    latitude: input.latitude,
    longitude: input.longitude,
    is_live: input.isLive,
    updated_at: new Date().toISOString(),
  };

  console.info("[live-location] upsert", {
    userId: user.id,
    latitude: payload.latitude,
    longitude: payload.longitude,
    isLive: payload.is_live,
  });

  const { data: updatedRows, error: updateError } = await supabase
    .from("user_live_locations")
    .update({
      latitude: payload.latitude,
      longitude: payload.longitude,
      is_live: payload.is_live,
      updated_at: payload.updated_at,
    })
    .eq("user_id", user.id)
    .select("user_id");

  if (updateError) {
    logLiveLocationIssue("upsert:update", updateError, payload);

    if (isMissingLiveLocationsTable(updateError)) {
      return { error: LIVE_LOCATION_ERROR.TABLE_MISSING };
    }

    return { error: formatLiveLocationSupabaseError(updateError) };
  }

  if (updatedRows?.length) {
    return { error: null };
  }

  const { error: insertError } = await supabase.from("user_live_locations").insert(payload);

  if (insertError) {
    logLiveLocationIssue("upsert:insert", insertError, payload);

    if (isMissingLiveLocationsTable(insertError)) {
      return { error: LIVE_LOCATION_ERROR.TABLE_MISSING };
    }

    return { error: formatLiveLocationSupabaseError(insertError) };
  }

  return { error: null };
}

export async function stopUserLiveLocation(input?: {
  latitude?: number;
  longitude?: number;
}): Promise<LiveLocationResult> {
  const { user, error: userError } = await getAuthenticatedUser();

  if (!user) {
    logLiveLocationIssue("stop:not-authenticated", { message: userError ?? "No user session" });
    return { error: null };
  }

  const updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_live_locations")
    .update({
      is_live: false,
      updated_at: updatedAt,
    })
    .eq("user_id", user.id)
    .select("user_id");

  if (error) {
    logLiveLocationIssue("stop:update", error, { userId: user.id });

    if (isMissingLiveLocationsTable(error)) {
      return { error: null };
    }

    const fallbackLatitude = input?.latitude;
    const fallbackLongitude = input?.longitude;

    if (
      fallbackLatitude != null &&
      fallbackLongitude != null &&
      !validateLiveCoordinates(fallbackLatitude, fallbackLongitude)
    ) {
      const { error: insertError } = await supabase.from("user_live_locations").insert({
        user_id: user.id,
        latitude: fallbackLatitude,
        longitude: fallbackLongitude,
        is_live: false,
        updated_at: updatedAt,
      });

      if (!insertError) {
        console.info("[live-location] stop via insert fallback", { userId: user.id });
        return { error: null };
      }

      logLiveLocationIssue("stop:insert-fallback", insertError, {
        userId: user.id,
        latitude: fallbackLatitude,
        longitude: fallbackLongitude,
      });
    }

    console.warn("[live-location] stop failed but treating hide as local success", {
      userId: user.id,
      reason: formatLiveLocationSupabaseError(error),
    });
    return { error: null };
  }

  if (!data?.length) {
    console.info("[live-location] stop: no existing row (already hidden)", { userId: user.id });
  } else {
    console.info("[live-location] stop: marked offline", { userId: user.id });
  }

  return { error: null };
}
