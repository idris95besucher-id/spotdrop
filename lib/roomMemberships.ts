import { formatUnreadBadge } from "@/lib/chatNotifications";
import type { OptimisticReadExcludes } from "@/lib/chatUnreadSync";
import { normalizeCountrySlug } from "@/lib/cityAttractionsCatalog";
import { COUNTRY_SLUG_TO_CODE } from "@/lib/i18n/geoCountryCodes";
import { supabase } from "@/lib/supabaseClient";

/** Keep in sync with CHATS_INBOX_REFRESH_EVENT in chatsInbox.ts (avoid circular import). */
const ROOM_INBOX_CHANGED_EVENT = "spotdrop:chats-inbox-refresh";

function notifyRoomInboxChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(ROOM_INBOX_CHANGED_EVENT));
}

export type RoomInboxRow = {
  membershipId: string;
  countrySlug: string;
  countryCode?: string | null;
  citySlug: string;
  cityName: string;
  countryName: string;
  lastMessageContent: string | null;
  lastAt: string;
  unreadCount: number;
  unreadBadge: string | null;
  isMuted: boolean;
};

type RoomMembershipRow = {
  id: string;
  country_slug: string;
  city_slug: string;
  last_read_at: string | null;
  is_muted: boolean;
  updated_at: string;
};

type CountryRow = {
  id: string;
  slug: string;
  name: string;
  code?: string | null;
};

type CityRow = {
  id: string;
  slug: string;
  name: string;
  country_id: string;
};

type CityMessageRow = {
  city_id: string;
  content: string;
  created_at: string;
  user_id: string;
};

export type RoomMembershipForCity = {
  countrySlug: string;
  citySlug: string;
  cityName: string;
  countryName: string;
  isMuted: boolean;
  isHidden: boolean;
};

const ROOM_MEMBERSHIP_EPOCH = "1970-01-01T00:00:00.000Z";

function isMissingRoomMembershipsTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("room_memberships") && message.includes("does not exist"))
  );
}

export const ROOM_FROM_MESSAGES = "messages";
export const ROOM_RETURN_SOURCE_KEY = "roomReturnSource";
export const ROOM_RETURN_HREF_KEY = "roomReturnHref";
export const ROOM_RETURN_SOURCE_MESSAGES = "messages";
export const ROOM_RETURN_HREF_CHATS = "/chats";

export type BuildRoomHrefOptions = {
  from?: typeof ROOM_FROM_MESSAGES;
};

export function setRoomReturnToMessages() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(ROOM_RETURN_SOURCE_KEY, ROOM_RETURN_SOURCE_MESSAGES);
  sessionStorage.setItem(ROOM_RETURN_HREF_KEY, ROOM_RETURN_HREF_CHATS);
}

export function clearRoomReturnNavigation() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(ROOM_RETURN_SOURCE_KEY);
  sessionStorage.removeItem(ROOM_RETURN_HREF_KEY);
}

export function readRoomReturnNavigation() {
  if (typeof window === "undefined") {
    return {
      sessionReturnSource: null as string | null,
      sessionReturnHref: null as string | null,
    };
  }

  return {
    sessionReturnSource: sessionStorage.getItem(ROOM_RETURN_SOURCE_KEY),
    sessionReturnHref: sessionStorage.getItem(ROOM_RETURN_HREF_KEY),
  };
}

export function readRoomNavigationFromWindowSearch() {
  if (typeof window === "undefined") {
    return {
      windowSearch: "",
      from: null as string | null,
      returnTo: null as string | null,
    };
  }

  const windowSearch = window.location.search;
  const params = new URLSearchParams(windowSearch);

  return {
    windowSearch,
    from: params.get("from"),
    returnTo: params.get("returnTo"),
  };
}

export function buildRoomHref(
  countrySlug: string,
  citySlug: string,
  options?: BuildRoomHrefOptions
) {
  const base = `/visit/${countrySlug}/${citySlug}`;

  if (options?.from === ROOM_FROM_MESSAGES) {
    return `${base}?from=${ROOM_FROM_MESSAGES}`;
  }

  return base;
}

export function parseInAppReferrerPath(referrer: string) {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer).pathname;
  } catch {
    return null;
  }
}

export function isMessagesReferrerPath(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const normalized = pathname.replace(/\/+$/, "") || "/";

  return (
    normalized === "/chats" ||
    normalized.startsWith("/chats/") ||
    normalized === "/messages" ||
    normalized.startsWith("/messages/")
  );
}

export function isRoomOpenedFromMessages(input: {
  from: string | null;
  returnTo?: string | null;
  referrerPath?: string | null;
  sessionReturnSource?: string | null;
}) {
  if (input.from === ROOM_FROM_MESSAGES) {
    return true;
  }

  if (input.sessionReturnSource === ROOM_RETURN_SOURCE_MESSAGES) {
    return true;
  }

  const returnTo = input.returnTo?.replace(/\/+$/, "") || null;

  if (returnTo === ROOM_RETURN_HREF_CHATS || returnTo === "/messages") {
    return true;
  }

  return isMessagesReferrerPath(input.referrerPath ?? null);
}

export function resolveRoomBackHref(input: {
  from: string | null;
  returnTo?: string | null;
  countrySlug: string;
  referrerPath?: string | null;
  sessionReturnSource?: string | null;
  sessionReturnHref?: string | null;
}) {
  if (isRoomOpenedFromMessages(input)) {
    return input.sessionReturnHref ?? ROOM_RETURN_HREF_CHATS;
  }

  return `/visit/${input.countrySlug}`;
}

export async function upsertRoomMembershipOnMessage(
  userId: string,
  countrySlug: string,
  citySlug: string
) {
  const now = new Date().toISOString();
  const normalizedCountry = countrySlug.trim().toLowerCase();
  const normalizedCity = citySlug.trim().toLowerCase();

  if (!userId || !normalizedCountry || !normalizedCity) {
    return { error: "Missing room membership fields." };
  }

  const { error } = await supabase.from("room_memberships").upsert(
    {
      user_id: userId,
      country_slug: normalizedCountry,
      city_slug: normalizedCity,
      is_hidden: false,
      joined_by_message: true,
      updated_at: now,
    },
    { onConflict: "user_id,country_slug,city_slug" }
  );

  if (error) {
    if (isMissingRoomMembershipsTable(error)) {
      console.warn("[room-memberships] table missing; skipping upsert");
      return { error: null as string | null };
    }

    console.error("Failed to upsert room membership:", error);
    return { error: error.message };
  }

  notifyRoomInboxChanged();

  return { error: null as string | null };
}

/** Resolve slugs from city_id then upsert — preferred when URL slugs may differ. */
export async function upsertRoomMembershipForCityId(userId: string, cityId: string) {
  if (!userId || !cityId) {
    return { error: "Missing room membership fields." };
  }

  const { data: cityRow, error: cityError } = await supabase
    .from("cities")
    .select("slug, countries(slug)")
    .eq("id", cityId)
    .maybeSingle();

  if (cityError) {
    console.error("[room-memberships] failed to resolve city for membership", cityError);
    return { error: cityError.message };
  }

  const countryJoin = cityRow?.countries as { slug?: string } | { slug?: string }[] | null;
  const country = Array.isArray(countryJoin) ? countryJoin[0] : countryJoin;
  const countrySlug = country?.slug?.trim().toLowerCase() ?? "";
  const citySlug = cityRow?.slug?.trim().toLowerCase() ?? "";

  if (!countrySlug || !citySlug) {
    return { error: "Unable to resolve city room for membership." };
  }

  return upsertRoomMembershipOnMessage(userId, countrySlug, citySlug);
}

export async function watchRoomMembership(userId: string, countrySlug: string, citySlug: string) {
  const now = new Date().toISOString();

  const { error } = await supabase.from("room_memberships").upsert(
    {
      user_id: userId,
      country_slug: countrySlug,
      city_slug: citySlug,
      is_hidden: false,
      joined_by_message: false,
      updated_at: now,
    },
    { onConflict: "user_id,country_slug,city_slug" }
  );

  if (error) {
    if (isMissingRoomMembershipsTable(error)) {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function markRoomAsRead(userId: string, countrySlug: string, citySlug: string) {
  const readAt = new Date().toISOString();

  const { error } = await supabase
    .from("room_memberships")
    .update({ last_read_at: readAt, updated_at: readAt })
    .eq("user_id", userId)
    .eq("country_slug", countrySlug)
    .eq("city_slug", citySlug);

  if (error) {
    if (isMissingRoomMembershipsTable(error)) {
      return { error: null as string | null };
    }

    console.error("[Unread] mark room read failed", error);
    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function setRoomMuted(
  userId: string,
  countrySlug: string,
  citySlug: string,
  isMuted: boolean
) {
  const { error } = await supabase
    .from("room_memberships")
    .update({ is_muted: isMuted })
    .eq("user_id", userId)
    .eq("country_slug", countrySlug)
    .eq("city_slug", citySlug);

  if (error) {
    if (isMissingRoomMembershipsTable(error)) {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function hideRoomFromMessages(userId: string, countrySlug: string, citySlug: string) {
  const { error } = await supabase
    .from("room_memberships")
    .update({ is_hidden: true })
    .eq("user_id", userId)
    .eq("country_slug", countrySlug.trim().toLowerCase())
    .eq("city_slug", citySlug.trim().toLowerCase());

  if (error) {
    if (isMissingRoomMembershipsTable(error)) {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  notifyRoomInboxChanged();

  return { error: null as string | null };
}

async function resolveMembershipCities(memberships: RoomMembershipRow[]) {
  const countrySlugs = [...new Set(memberships.map((row) => row.country_slug))];

  const { data: countries, error: countriesError } = await supabase
    .from("countries")
    .select("id, slug, name, code")
    .in("slug", countrySlugs);

  if (countriesError) {
    return { resolved: [], error: countriesError.message };
  }

  const countryBySlug = new Map((countries ?? []).map((row) => [row.slug, row as CountryRow]));
  const countryIds = [...countryBySlug.values()].map((row) => row.id);

  if (countryIds.length === 0) {
    return { resolved: [], error: null as string | null };
  }

  const { data: cities, error: citiesError } = await supabase
    .from("cities")
    .select("id, slug, name, country_id")
    .in("country_id", countryIds);

  if (citiesError) {
    return { resolved: [], error: citiesError.message };
  }

  const cityByKey = new Map<string, CityRow>();

  for (const city of (cities ?? []) as CityRow[]) {
    const country = [...countryBySlug.values()].find((row) => row.id === city.country_id);
    if (country) {
      cityByKey.set(`${country.slug}:${city.slug}`, city);
    }
  }

  const resolved = memberships.flatMap((membership) => {
    const country = countryBySlug.get(membership.country_slug);
    const city = cityByKey.get(`${membership.country_slug}:${membership.city_slug}`);

    if (!country || !city) {
      return [];
    }

    return [
      {
        membership,
        cityId: city.id,
        cityName: city.name,
        countryName: country.name,
        countryCode: country.code ?? null,
      },
    ];
  });

  return { resolved, error: null as string | null };
}

function buildRoomInboxRows(
  userId: string,
  resolved: Array<{
    membership: RoomMembershipRow;
    cityId: string;
    cityName: string;
    countryName: string;
    countryCode: string | null;
  }>,
  messages: CityMessageRow[]
) {
  const messagesByCity = new Map<string, CityMessageRow[]>();

  for (const message of messages) {
    const bucket = messagesByCity.get(message.city_id) ?? [];
    bucket.push(message);
    messagesByCity.set(message.city_id, bucket);
  }

  const rooms: RoomInboxRow[] = resolved.map(({ membership, cityId, cityName, countryName, countryCode }) => {
    const cityMessages = messagesByCity.get(cityId) ?? [];
    const latest = cityMessages[0] ?? null;
    const lastReadAt = membership.last_read_at ?? ROOM_MEMBERSHIP_EPOCH;
    const unreadCount = membership.is_muted
      ? 0
      : cityMessages.filter(
          (message) => message.user_id !== userId && message.created_at > lastReadAt
        ).length;

    return {
      membershipId: membership.id,
      countrySlug: membership.country_slug,
      countryCode,
      citySlug: membership.city_slug,
      cityName,
      countryName,
      lastMessageContent: latest?.content ?? null,
      lastAt: latest?.created_at ?? membership.updated_at,
      unreadCount,
      unreadBadge: formatUnreadBadge(unreadCount),
      isMuted: membership.is_muted,
    };
  });

  rooms.sort((left, right) => new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime());

  return rooms;
}

function isMissingRoomInboxRpc(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "PGRST202" ||
    message.includes("get_user_room_inbox") ||
    (message.includes("function") && message.includes("schema cache"))
  );
}

type RoomInboxRpcRow = {
  country_slug: string;
  city_slug: string;
  country_name: string;
  city_name: string;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
  is_muted: boolean;
  is_hidden: boolean;
};

function countryCodeFromInboxRow(countrySlug: string, countryName: string) {
  const normalizedSlug = normalizeCountrySlug(countrySlug, countryName);
  return COUNTRY_SLUG_TO_CODE[normalizedSlug]?.toUpperCase() ?? null;
}

function mapRpcRowsToInbox(rows: RoomInboxRpcRow[]): RoomInboxRow[] {
  return rows.map((row) => ({
    membershipId: `${row.country_slug}:${row.city_slug}`,
    countrySlug: row.country_slug,
    countryCode: countryCodeFromInboxRow(row.country_slug, row.country_name),
    citySlug: row.city_slug,
    cityName: row.city_name,
    countryName: row.country_name,
    lastMessageContent: row.last_message,
    lastAt: row.last_message_at,
    unreadCount: row.unread_count,
    unreadBadge: formatUnreadBadge(row.unread_count),
    isMuted: row.is_muted,
  }));
}

async function loadRoomInboxViaRpc(userId: string) {
  const { data, error } = await supabase.rpc("get_user_room_inbox", {
    p_user_id: userId,
  });

  if (error) {
    if (isMissingRoomInboxRpc(error)) {
      return { rooms: null as RoomInboxRow[] | null, error: null as string | null, rpcMissing: true };
    }

    console.error("[room-memberships] RPC get_user_room_inbox failed", error);
    return { rooms: [] as RoomInboxRow[], error: error.message, rpcMissing: false };
  }

  return {
    rooms: mapRpcRowsToInbox((data ?? []) as RoomInboxRpcRow[]),
    error: null as string | null,
    rpcMissing: false,
  };
}

async function loadRoomInboxViaQueries(userId: string) {
  const { data: memberships, error: membershipsError } = await supabase
    .from("room_memberships")
    .select("id, country_slug, city_slug, last_read_at, is_muted, updated_at")
    .eq("user_id", userId)
    .eq("is_hidden", false);

  if (membershipsError) {
    if (isMissingRoomMembershipsTable(membershipsError)) {
      console.warn("[room-memberships] table missing; returning empty room inbox");
      return { rooms: [] as RoomInboxRow[], error: null as string | null };
    }

    console.error("[room-memberships] failed to load memberships", membershipsError);
    return { rooms: [] as RoomInboxRow[], error: membershipsError.message };
  }

  if (!memberships?.length) {
    return { rooms: [], error: null as string | null };
  }

  const { resolved, error: resolveError } = await resolveMembershipCities(
    memberships as RoomMembershipRow[]
  );

  if (resolveError) {
    console.error("[room-memberships] failed to resolve cities", resolveError);
    return { rooms: [], error: resolveError };
  }

  if (resolved.length === 0) {
    return { rooms: [], error: null as string | null };
  }

  const cityIds = resolved.map((row) => row.cityId);

  const { data: messages, error: messagesError } = await supabase
    .from("city_messages")
    .select("city_id, content, created_at, user_id")
    .in("city_id", cityIds)
    .order("created_at", { ascending: false });

  if (messagesError) {
    console.error("[room-memberships] failed to load city messages", messagesError);
    return { rooms: [], error: messagesError.message };
  }

  return {
    rooms: buildRoomInboxRows(userId, resolved, (messages ?? []) as CityMessageRow[]),
    error: null as string | null,
  };
}

export async function loadRoomInbox(userId: string) {
  const rpcResult = await loadRoomInboxViaRpc(userId);

  if (!rpcResult.error && !rpcResult.rpcMissing && rpcResult.rooms) {
    return { rooms: rpcResult.rooms, error: null as string | null };
  }

  // Always fall back to direct membership queries if RPC is missing or fails.
  const queryResult = await loadRoomInboxViaQueries(userId);

  if (queryResult.error && rpcResult.error && !rpcResult.rpcMissing) {
    return {
      rooms: queryResult.rooms,
      error: queryResult.error || rpcResult.error,
    };
  }

  return queryResult;
}

export async function countUnreadRoomMessages(userId: string, excludes?: OptimisticReadExcludes) {
  const { rooms, error } = await loadRoomInbox(userId);

  if (error) {
    return { count: 0, error };
  }

  const excludedRooms = excludes?.roomKeys;
  const count = rooms.reduce((total, room) => {
    const key = `${room.countrySlug}/${room.citySlug}`;

    if (excludedRooms?.has(key)) {
      return total;
    }

    return total + room.unreadCount;
  }, 0);

  return { count, error: null as string | null };
}

export async function fetchRoomMembershipForCity(
  userId: string,
  cityId: string
): Promise<RoomMembershipForCity | null> {
  const { data: cityRow, error: cityError } = await supabase
    .from("cities")
    .select("id, slug, name, countries(slug, name)")
    .eq("id", cityId)
    .maybeSingle();

  if (cityError) {
    if (isMissingRoomMembershipsTable(cityError)) {
      return null;
    }

    console.error("[room-memberships] failed to load city for notification", cityError);
    return null;
  }

  if (!cityRow) {
    return null;
  }

  const countryJoin = cityRow.countries as CountryRow | CountryRow[] | null;
  const country = Array.isArray(countryJoin) ? countryJoin[0] : countryJoin;

  if (!country?.slug) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("room_memberships")
    .select("is_muted, is_hidden")
    .eq("user_id", userId)
    .eq("country_slug", country.slug)
    .eq("city_slug", cityRow.slug)
    .maybeSingle();

  if (membershipError) {
    if (isMissingRoomMembershipsTable(membershipError)) {
      return null;
    }

    console.error("[room-memberships] failed to load membership for notification", membershipError);
    return null;
  }

  if (!membership) {
    return null;
  }

  return {
    countrySlug: country.slug,
    citySlug: cityRow.slug,
    cityName: cityRow.name,
    countryName: country.name,
    isMuted: Boolean(membership.is_muted),
    isHidden: Boolean(membership.is_hidden),
  };
}
