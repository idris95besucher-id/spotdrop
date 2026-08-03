import {
  DEFAULT_MAP_MARK_CATEGORY,
  normalizeMapMarkCategory,
  type MapMarkCategoryKey,
} from "@/lib/mapMarkCategories";
import { encodeCityRoomMapMarkMessage } from "@/lib/cityRoomMapMarkMessage";
import { publicProfileUsername } from "@/lib/publicProfile";
import { uploadPostMedia } from "@/lib/postMedia";
import {
  reverseGeocode,
  spotLocationFromCoordinates,
  type SpotGeoLocation,
} from "@/lib/spotLocation";
import {
  resolveRegionRoomFromAddress,
  type RegionRoomResolution,
} from "@/lib/regionRoomResolver";
import { supabase } from "@/lib/supabaseClient";

/** Concise share diagnostics — remove after global routing is confirmed in production. */
const MARK_SHARE_LOG = true;

function markShareLog(event: string, payload: Record<string, unknown>) {
  if (!MARK_SHARE_LOG) {
    return;
  }

  console.info(`[mark-share] ${event}`, payload);
}

export type MapMark = {
  id: string;
  user_id: string;
  text: string;
  photo_url: string | null;
  latitude: number;
  longitude: number;
  place_name: string | null;
  address: string | null;
  category: MapMarkCategoryKey;
  municipality: string | null;
  region_code: string | null;
  region_name: string | null;
  /** @deprecated use region_code */
  canton_code: string | null;
  /** @deprecated use region_name */
  canton_name: string | null;
  country_slug: string | null;
  country_code: string | null;
  hub_city_slug: string | null;
  created_at: string;
  updated_at: string;
  /** Marks auto-expire (and are hidden by RLS) 24h after created_at. */
  expires_at: string | null;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
};

/** True once a mark has passed its 24h expiry — used as a client-side belt-and-suspenders check on top of the RLS policy that already hides expired rows. */
export function isMapMarkExpired(mark: Pick<MapMark, "expires_at" | "created_at">): boolean {
  const expiresAt = mark.expires_at ? Date.parse(mark.expires_at) : NaN;

  if (Number.isFinite(expiresAt)) {
    return expiresAt <= Date.now();
  }

  // Older rows fetched before the `expires_at` column existed — fall back to created_at + 24h.
  const createdAt = Date.parse(mark.created_at);
  if (!Number.isFinite(createdAt)) {
    return false;
  }

  return createdAt + 24 * 60 * 60 * 1000 <= Date.now();
}

export type MapMarkInput = {
  userId: string;
  text: string;
  photoFile?: File | null;
  location: SpotGeoLocation;
  placeName: string;
  category?: MapMarkCategoryKey | null;
};

/** Embed via map_marks_user_id_fkey — never posts_user_id_fkey. */
export const MAP_MARK_AUTHOR_PROFILES = "profiles!map_marks_user_id_fkey";

const MAP_MARK_SELECT = `
  id,
  user_id,
  text,
  photo_url,
  latitude,
  longitude,
  place_name,
  address,
  category,
  municipality,
  region_code,
  region_name,
  canton_code,
  canton_name,
  country_slug,
  country_code,
  hub_city_slug,
  created_at,
  updated_at,
  expires_at,
  ${MAP_MARK_AUTHOR_PROFILES}(username, avatar_url, is_private, is_demo, is_verified)
`;

const RELATED_SPOT_COORD_EPS = 0.00005; // ~5.5m — matches near-identical map taps

function coordsMatch(
  latitude: number,
  longitude: number,
  spotLatitude: number | null | undefined,
  spotLongitude: number | null | undefined
) {
  const lat = Number(spotLatitude);
  const lng = Number(spotLongitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  return (
    Math.abs(lat - latitude) <= RELATED_SPOT_COORD_EPS &&
    Math.abs(lng - longitude) <= RELATED_SPOT_COORD_EPS
  );
}

/**
 * Resolve a public Spot post linked to this map mark.
 * Prefers same author + matching coordinates, then photo URL, then any Spot at those coords.
 * Returns null when no related Spot exists (caller hides See Spot).
 */
export async function resolveRelatedSpotPostIdForMapMark(
  mark: Pick<MapMark, "user_id" | "latitude" | "longitude" | "photo_url">
): Promise<string | null> {
  const lat = Number(mark.latitude);
  const lng = Number(mark.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const photoUrl = mark.photo_url?.trim() || null;

  if (photoUrl) {
    const { data: byPhoto } = await supabase
      .from("posts")
      .select("id")
      .eq("content_kind", "spot")
      .eq("visibility", "public")
      .eq("published_to_spots", true)
      .eq("media_url", photoUrl)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const photoId = byPhoto?.id != null ? String(byPhoto.id) : null;

    if (photoId) {
      return photoId;
    }
  }

  const { data: rows, error } = await supabase
    .from("posts")
    .select("id, user_id, spot_latitude, spot_longitude")
    .eq("content_kind", "spot")
    .eq("visibility", "public")
    .eq("published_to_spots", true)
    .gte("spot_latitude", lat - RELATED_SPOT_COORD_EPS)
    .lte("spot_latitude", lat + RELATED_SPOT_COORD_EPS)
    .gte("spot_longitude", lng - RELATED_SPOT_COORD_EPS)
    .lte("spot_longitude", lng + RELATED_SPOT_COORD_EPS)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error || !rows?.length) {
    return null;
  }

  const matching = rows.filter((row) =>
    coordsMatch(lat, lng, row.spot_latitude as number | null, row.spot_longitude as number | null)
  );

  if (matching.length === 0) {
    return null;
  }

  const sameAuthor = matching.find((row) => String(row.user_id) === mark.user_id);
  const chosen = sameAuthor ?? matching[0]!;

  return String(chosen.id);
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

function isMissingColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || (error?.message?.toLowerCase().includes("column") ?? false);
}

function mapRowToMark(row: Record<string, unknown>): MapMark | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  if (latitude === 0 && longitude === 0) {
    return null;
  }

  const profileJoin = row.profiles as
    | {
        username?: string;
        avatar_url?: string | null;
        is_private?: boolean;
        is_demo?: boolean;
        is_verified?: boolean | null;
      }
    | {
        username?: string;
        avatar_url?: string | null;
        is_private?: boolean;
        is_demo?: boolean;
        is_verified?: boolean | null;
      }[]
    | null;
  const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    text: String(row.text ?? ""),
    photo_url: (row.photo_url as string | null) ?? null,
    latitude,
    longitude,
    place_name: (row.place_name as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    category: normalizeMapMarkCategory((row.category as string | null) ?? DEFAULT_MAP_MARK_CATEGORY),
    municipality: (row.municipality as string | null) ?? null,
    region_code:
      (row.region_code as string | null) ?? (row.canton_code as string | null) ?? null,
    region_name:
      (row.region_name as string | null) ?? (row.canton_name as string | null) ?? null,
    canton_code:
      (row.canton_code as string | null) ?? (row.region_code as string | null) ?? null,
    canton_name:
      (row.canton_name as string | null) ?? (row.region_name as string | null) ?? null,
    country_slug: (row.country_slug as string | null) ?? null,
    country_code: (row.country_code as string | null) ?? null,
    hub_city_slug: (row.hub_city_slug as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    expires_at: (row.expires_at as string | null) ?? null,
    username: publicProfileUsername(profile?.username),
    avatar_url: profile?.avatar_url ?? null,
    is_verified: profile?.is_verified ?? null,
  };
}

export async function loadMapMarks(limit = 400) {
  const nowIso = new Date().toISOString();

  const primary = await supabase
    .from("map_marks")
    .select(MAP_MARK_SELECT)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  let data: unknown = primary.data;
  let error = primary.error;

  if (error && isMissingColumn(error)) {
    const fallback = await supabase
      .from("map_marks")
      .select(
        `id, user_id, text, photo_url, latitude, longitude, place_name, address, created_at, updated_at, ${MAP_MARK_AUTHOR_PROFILES}(username, avatar_url, is_private, is_demo, is_verified)`
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingTable(error)) {
      return { marks: [] as MapMark[], error: "TABLE_MISSING" as const };
    }

    return { marks: [] as MapMark[], error: error.message };
  }

  const marks: MapMark[] = [];

  for (const row of (data as unknown[]) ?? []) {
    const mark = mapRowToMark(row as Record<string, unknown>);

    if (mark && !isMapMarkExpired(mark)) {
      marks.push(mark);
    }
  }

  return { marks, error: null };
}

export async function loadMapMarkById(markId: string) {
  const id = markId.trim();

  if (!id) {
    return { mark: null as MapMark | null, error: "Missing mark id." };
  }

  const primary = await supabase.from("map_marks").select(MAP_MARK_SELECT).eq("id", id).maybeSingle();

  let data: unknown = primary.data;
  let error = primary.error;

  if (error && isMissingColumn(error)) {
    const fallback = await supabase
      .from("map_marks")
      .select(
        `id, user_id, text, photo_url, latitude, longitude, place_name, address, created_at, updated_at, ${MAP_MARK_AUTHOR_PROFILES}(username, avatar_url, is_private, is_demo, is_verified)`
      )
      .eq("id", id)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return { mark: null as MapMark | null, error: error.message };
  }

  if (!data) {
    return { mark: null as MapMark | null, error: null };
  }

  const mark = mapRowToMark(data as Record<string, unknown>);

  if (mark && isMapMarkExpired(mark)) {
    return { mark: null as MapMark | null, error: null };
  }

  return { mark, error: null };
}

function resolveRegionFields(location: SpotGeoLocation): RegionRoomResolution {
  return resolveRegionRoomFromAddress(location.addressDetails ?? null, {
    countryHint: location.country,
  });
}

async function resolveMarkRegion(location: SpotGeoLocation): Promise<{
  location: SpotGeoLocation;
  region: RegionRoomResolution;
}> {
  let resolvedLocation = location;
  let region = resolveRegionFields(resolvedLocation);

  if (!region.roomCitySlug || !region.subdivisionCode) {
    try {
      const fresh = await spotLocationFromCoordinates(location.latitude, location.longitude);
      resolvedLocation = {
        ...location,
        ...fresh,
        addressDetails: fresh.addressDetails ?? location.addressDetails ?? null,
      };
      region = resolveRegionFields(resolvedLocation);
    } catch {
      // Keep prior resolution.
    }
  }

  if ((!region.roomCitySlug || !region.subdivisionCode) && !resolvedLocation.addressDetails) {
    try {
      const geocoded = await reverseGeocode(location.latitude, location.longitude);
      resolvedLocation = {
        ...resolvedLocation,
        address: geocoded.address ?? resolvedLocation.address,
        city: geocoded.city ?? resolvedLocation.city,
        country: geocoded.country ?? resolvedLocation.country,
        addressDetails: geocoded.addressDetails ?? null,
      };
      region = resolveRegionFields(resolvedLocation);
    } catch {
      // Keep prior resolution.
    }
  }

  return { location: resolvedLocation, region };
}

async function lookupHubCityId(countrySlug: string, hubCitySlug: string) {
  const { data: country, error: countryError } = await supabase
    .from("countries")
    .select("id")
    .eq("slug", countrySlug)
    .maybeSingle();

  if (countryError || !country?.id) {
    markShareLog("country_lookup_failed", {
      countrySlug,
      hubCitySlug,
      error: countryError?.message ?? "missing",
    });
    return null;
  }

  const { data: city, error: cityError } = await supabase
    .from("cities")
    .select("id")
    .eq("country_id", country.id)
    .eq("slug", hubCitySlug)
    .maybeSingle();

  if (cityError || city?.id == null) {
    markShareLog("city_lookup_failed", {
      countrySlug,
      hubCitySlug,
      countryId: country.id,
      error: cityError?.message ?? "missing",
    });
    return null;
  }

  return city.id as string | number;
}

async function cityMessageAlreadyShared(cityId: string | number, markId: string) {
  const { data, error } = await supabase
    .from("city_messages")
    .select("id, content, map_mark_id")
    .eq("city_id", cityId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    if (isMissingColumn(error)) {
      const fallback = await supabase
        .from("city_messages")
        .select("id, content")
        .eq("city_id", cityId)
        .order("created_at", { ascending: false })
        .limit(40);

      const rows = fallback.data ?? [];
      return rows.some((row) => String(row.content ?? "").includes(markId));
    }

    return false;
  }

  return (data ?? []).some((row) => {
    if (row.map_mark_id != null && String(row.map_mark_id) === markId) {
      return true;
    }

    return String(row.content ?? "").includes(markId);
  });
}

async function insertMapMarkRoomMessage(input: {
  mark: MapMark;
  region: RegionRoomResolution;
  cityId: string | number;
}) {
  const regionName = input.region.regionName ?? input.mark.region_name;
  const content = encodeCityRoomMapMarkMessage({
    mapMarkId: input.mark.id,
    category: input.mark.category,
    text: input.mark.text,
    photoUrl: input.mark.photo_url,
    municipality: input.region.municipality ?? input.mark.municipality,
    regionName,
    cantonName: regionName,
    countryName: input.region.countryName ?? input.mark.country_slug,
    placeName: input.mark.place_name,
    latitude: input.mark.latitude,
    longitude: input.mark.longitude,
    creatorUserId: input.mark.user_id,
    creatorUsername: input.mark.username,
    creatorAvatarUrl: input.mark.avatar_url,
  });

  const withRelation = await supabase
    .from("city_messages")
    .insert({
      city_id: input.cityId,
      user_id: input.mark.user_id,
      content,
      map_mark_id: input.mark.id,
    })
    .select("id")
    .single();

  if (!withRelation.error && withRelation.data?.id) {
    return { messageId: String(withRelation.data.id), error: null as string | null };
  }

  if (withRelation.error && isMissingColumn(withRelation.error)) {
    const legacy = await supabase
      .from("city_messages")
      .insert({
        city_id: input.cityId,
        user_id: input.mark.user_id,
        content,
      })
      .select("id")
      .single();

    if (legacy.error) {
      markShareLog("legacy_insert_failed", {
        markId: input.mark.id,
        cityId: input.cityId,
        error: legacy.error.message,
      });
      return { messageId: null as string | null, error: legacy.error.message };
    }

    return { messageId: legacy.data?.id != null ? String(legacy.data.id) : null, error: null };
  }

  if (withRelation.error) {
    const duplicate =
      withRelation.error.code === "23505" ||
      withRelation.error.message.toLowerCase().includes("duplicate");

    markShareLog(duplicate ? "duplicate_conflict" : "insert_failed", {
      markId: input.mark.id,
      cityId: input.cityId,
      error: withRelation.error.message,
    });

    if (duplicate) {
      return { messageId: null as string | null, error: null };
    }

    return { messageId: null as string | null, error: withRelation.error.message };
  }

  return { messageId: null as string | null, error: "insert_failed" };
}

async function shareMapMarkToRegionRoom(mark: MapMark, region: RegionRoomResolution) {
  markShareLog("start", {
    markId: mark.id,
    latitude: mark.latitude,
    longitude: mark.longitude,
    municipality: region.municipality,
    country: region.countrySlug,
    subdivision: region.subdivisionCode,
    hub: region.roomCitySlug,
    source: region.source,
  });

  if (!region.roomCitySlug || !region.subdivisionCode || !region.countrySlug) {
    markShareLog("skipped_unresolved", {
      markId: mark.id,
      municipality: region.municipality,
      countrySlug: region.countrySlug,
    });
    return { messageId: null as string | null, error: "unresolved_region" };
  }

  let rpc = await supabase.rpc("share_map_mark_to_region_room", {
    p_mark_id: mark.id,
  });

  if (rpc.error) {
    rpc = await supabase.rpc("share_map_mark_to_swiss_canton_room", {
      p_mark_id: mark.id,
    });
  }

  if (!rpc.error && rpc.data != null) {
    markShareLog("rpc_ok", { markId: mark.id, messageId: rpc.data, roomHub: region.roomCitySlug });
    return { messageId: String(rpc.data), error: null };
  }

  if (rpc.error) {
    markShareLog("rpc_unavailable_or_failed", {
      markId: mark.id,
      error: rpc.error.message,
      code: rpc.error.code,
    });
  }

  const cityId = await lookupHubCityId(region.countrySlug, region.roomCitySlug);

  if (cityId == null) {
    return { messageId: null as string | null, error: "hub_city_missing" };
  }

  markShareLog("hub_resolved", {
    markId: mark.id,
    hub: region.roomCitySlug,
    cityId,
    countrySlug: region.countrySlug,
  });

  if (await cityMessageAlreadyShared(cityId, mark.id)) {
    markShareLog("already_shared", { markId: mark.id, cityId });
    return { messageId: null as string | null, error: null };
  }

  const inserted = await insertMapMarkRoomMessage({ mark, region, cityId });

  if (inserted.messageId) {
    markShareLog("insert_ok", {
      markId: mark.id,
      messageId: inserted.messageId,
      cityId,
      hub: region.roomCitySlug,
    });
  }

  return inserted;
}

export async function createMapMark(input: MapMarkInput) {
  const text = input.text.trim();

  if (!text) {
    return { mark: null as MapMark | null, error: "Text is required." };
  }

  let photoUrl: string | null = null;

  if (input.photoFile) {
    try {
      const upload = await uploadPostMedia(input.userId, input.photoFile, {
        skipVerification: true,
      });
      photoUrl = upload.mediaUrl;
    } catch (error) {
      return {
        mark: null as MapMark | null,
        error: error instanceof Error ? error.message : "Photo upload failed.",
      };
    }
  }

  const category = normalizeMapMarkCategory(input.category);
  const { location: resolvedLocation, region } = await resolveMarkRegion(input.location);

  markShareLog("region_resolved", {
    latitude: resolvedLocation.latitude,
    longitude: resolvedLocation.longitude,
    municipality: region.municipality,
    country: region.countrySlug,
    subdivision: region.subdivisionCode,
    hub: region.roomCitySlug,
    source: region.source,
    hasAddressDetails: Boolean(resolvedLocation.addressDetails),
  });

  const placeName =
    input.placeName.trim() ||
    resolvedLocation.address?.trim() ||
    [resolvedLocation.city, resolvedLocation.country].filter(Boolean).join(", ") ||
    null;

  const insertPayload: Record<string, unknown> = {
    user_id: input.userId,
    text,
    photo_url: photoUrl,
    latitude: resolvedLocation.latitude,
    longitude: resolvedLocation.longitude,
    place_name: placeName,
    address: resolvedLocation.address?.trim() || null,
    category,
    municipality: region.municipality,
    region_code: region.subdivisionCode,
    region_name: region.regionName,
    canton_code: region.subdivisionCode,
    canton_name: region.regionName,
    country_slug: region.countrySlug,
    country_code: region.countryCode,
    hub_city_slug: region.roomCitySlug,
  };

  let { data, error } = await supabase.from("map_marks").insert(insertPayload).select(MAP_MARK_SELECT).single();

  if (error && isMissingColumn(error)) {
    markShareLog("mark_insert_legacy_columns", { error: error.message });
    const legacy = await supabase
      .from("map_marks")
      .insert({
        user_id: input.userId,
        text,
        photo_url: photoUrl,
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
        place_name: placeName,
        address: resolvedLocation.address?.trim() || null,
      })
      .select(
        `id, user_id, text, photo_url, latitude, longitude, place_name, address, created_at, updated_at, ${MAP_MARK_AUTHOR_PROFILES}(username, avatar_url, is_private, is_demo, is_verified)`
      )
      .single();
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error) {
    if (isMissingTable(error)) {
      return { mark: null as MapMark | null, error: "TABLE_MISSING" as const };
    }

    return { mark: null as MapMark | null, error: error.message };
  }

  const mark = mapRowToMark(data as unknown as Record<string, unknown>);

  if (mark) {
    mark.category = category;
    mark.municipality = region.municipality;
    mark.region_code = region.subdivisionCode;
    mark.region_name = region.regionName;
    mark.canton_code = region.subdivisionCode;
    mark.canton_name = region.regionName;
    mark.country_slug = region.countrySlug;
    mark.country_code = region.countryCode;
    mark.hub_city_slug = region.roomCitySlug;

    if (region.roomCitySlug && region.subdivisionCode && region.countrySlug) {
      try {
        await shareMapMarkToRegionRoom(mark, region);
      } catch (shareError) {
        markShareLog("share_exception", {
          markId: mark.id,
          error: shareError instanceof Error ? shareError.message : String(shareError),
        });
      }
    } else {
      markShareLog("share_skipped_no_hub", {
        markId: mark.id,
        countrySlug: region.countrySlug,
        municipality: region.municipality,
      });
    }
  }

  return { mark, error: null };
}

export async function updateMapMark(
  markId: string,
  userId: string,
  input: { text: string; photoFile?: File | null; clearPhoto?: boolean; category?: MapMarkCategoryKey | null }
) {
  const text = input.text.trim();

  if (!text) {
    return { mark: null as MapMark | null, error: "Text is required." };
  }

  const patch: Record<string, unknown> = {
    text,
    updated_at: new Date().toISOString(),
  };

  if (input.category != null) {
    patch.category = normalizeMapMarkCategory(input.category);
  }

  if (input.clearPhoto) {
    patch.photo_url = null;
  } else if (input.photoFile) {
    try {
      const upload = await uploadPostMedia(userId, input.photoFile, { skipVerification: true });
      patch.photo_url = upload.mediaUrl;
    } catch (error) {
      return {
        mark: null as MapMark | null,
        error: error instanceof Error ? error.message : "Photo upload failed.",
      };
    }
  }

  let data: unknown = null;
  let error: { code?: string; message?: string } | null = null;

  const primaryUpdate = await supabase
    .from("map_marks")
    .update(patch)
    .eq("id", markId)
    .eq("user_id", userId)
    .select(MAP_MARK_SELECT)
    .single();

  data = primaryUpdate.data;
  error = primaryUpdate.error;

  if (error && isMissingColumn(error)) {
    const legacyPatch = { ...patch };
    delete legacyPatch.category;
    const legacy = await supabase
      .from("map_marks")
      .update(legacyPatch)
      .eq("id", markId)
      .eq("user_id", userId)
      .select(
        `id, user_id, text, photo_url, latitude, longitude, place_name, address, created_at, updated_at, ${MAP_MARK_AUTHOR_PROFILES}(username, avatar_url, is_private, is_demo, is_verified)`
      )
      .single();
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    return { mark: null as MapMark | null, error: error.message };
  }

  return { mark: mapRowToMark(data as Record<string, unknown>), error: null };
}

export async function deleteMapMark(markId: string, userId: string) {
  const { error } = await supabase.from("map_marks").delete().eq("id", markId).eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
