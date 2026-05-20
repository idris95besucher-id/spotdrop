import {
  BERN_DISCOVERY_PLACES_FALLBACK,
  BERN_DISCOVERY_REGION_SLUG,
  BERN_MAP_BOUNDS,
  type DiscoveryPlace,
  type DiscoveryPlaceCategory,
  type DiscoveryRegion,
  isDiscoveryRelationMissing,
} from "@/lib/discoveryMap";
import { supabase } from "@/lib/supabaseClient";

export type DiscoveryPlacePost = {
  id: string;
  user_id: string;
  content: string;
  content_kind: "post" | "story" | "video";
  media_url: string | null;
  media_type: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  expires_at: string | null;
  profiles: { username: string; avatar_url: string | null; is_ai_guide: boolean; is_official: boolean } | null;
};

export type DiscoveryPlaceComment = {
  id: number;
  place_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; avatar_url: string | null } | null;
};

type ProfileJoin = {
  username: string;
  avatar_url: string | null;
  is_ai_guide?: boolean;
  is_official?: boolean;
};

function normalizeProfileJoin<T extends ProfileJoin>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function mapPostRow(row: Record<string, unknown>): DiscoveryPlacePost {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    content: String(row.content),
    content_kind: row.content_kind as DiscoveryPlacePost["content_kind"],
    media_url: (row.media_url as string | null) ?? null,
    media_type: (row.media_type as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    created_at: String(row.created_at),
    expires_at: (row.expires_at as string | null) ?? null,
    profiles: (() => {
      const profile = normalizeProfileJoin(
        row.profiles as (ProfileJoin & { is_ai_guide?: boolean; is_official?: boolean }) | null
      );
      if (!profile) return null;
      return {
        username: profile.username,
        avatar_url: profile.avatar_url,
        is_ai_guide: Boolean(profile.is_ai_guide),
        is_official: Boolean(profile.is_official),
      };
    })(),
  };
}

function mapCommentRow(row: Record<string, unknown>): DiscoveryPlaceComment {
  return {
    id: Number(row.id),
    place_id: String(row.place_id),
    user_id: String(row.user_id),
    content: String(row.content),
    created_at: String(row.created_at),
    profiles: normalizeProfileJoin(row.profiles as ProfileJoin),
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return 0;
}

function mapPlaceRow(row: Record<string, unknown>): DiscoveryPlace {
  return {
    id: String(row.id),
    region_id: String(row.region_id),
    slug: String(row.slug),
    name: String(row.name),
    category: row.category as DiscoveryPlaceCategory,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    short_description: (row.short_description as string | null) ?? null,
    official_summary: (row.official_summary as string | null) ?? null,
    hero_image_url: (row.hero_image_url as string | null) ?? null,
    official_url: (row.official_url as string | null) ?? null,
    sort_order: toNumber(row.sort_order),
  };
}

function fallbackPlaces(regionId: string): DiscoveryPlace[] {
  return BERN_DISCOVERY_PLACES_FALLBACK.map((place, index) => ({
    ...place,
    id: `fallback-${place.slug}`,
    region_id: regionId,
    sort_order: place.sort_order || (index + 1) * 10,
  }));
}

export async function loadBernDiscoveryRegion() {
  const { data, error } = await supabase
    .from("discovery_regions")
    .select("id, country_slug, slug, name, city_slug, map_bounds_north, map_bounds_south, map_bounds_east, map_bounds_west")
    .eq("country_slug", "switzerland")
    .eq("slug", BERN_DISCOVERY_REGION_SLUG)
    .maybeSingle();

  if (error && isDiscoveryRelationMissing(error)) {
    return {
      region: {
        id: "fallback-region",
        country_slug: "switzerland",
        slug: BERN_DISCOVERY_REGION_SLUG,
        name: "Bern & Oberland",
        city_slug: "bern",
        map_bounds_north: BERN_MAP_BOUNDS.north,
        map_bounds_south: BERN_MAP_BOUNDS.south,
        map_bounds_east: BERN_MAP_BOUNDS.east,
        map_bounds_west: BERN_MAP_BOUNDS.west,
      } satisfies DiscoveryRegion,
      error: null,
      usingFallback: true,
    };
  }

  if (error || !data) {
    return {
      region: {
        id: "fallback-region",
        country_slug: "switzerland",
        slug: BERN_DISCOVERY_REGION_SLUG,
        name: "Bern & Oberland",
        city_slug: "bern",
        map_bounds_north: BERN_MAP_BOUNDS.north,
        map_bounds_south: BERN_MAP_BOUNDS.south,
        map_bounds_east: BERN_MAP_BOUNDS.east,
        map_bounds_west: BERN_MAP_BOUNDS.west,
      } satisfies DiscoveryRegion,
      error: error?.message ?? null,
      usingFallback: true,
    };
  }

  return {
    region: {
      id: data.id,
      country_slug: data.country_slug,
      slug: data.slug,
      name: data.name,
      city_slug: data.city_slug,
      map_bounds_north: toNumber(data.map_bounds_north),
      map_bounds_south: toNumber(data.map_bounds_south),
      map_bounds_east: toNumber(data.map_bounds_east),
      map_bounds_west: toNumber(data.map_bounds_west),
    } satisfies DiscoveryRegion,
    error: null,
    usingFallback: false,
  };
}

export async function loadDiscoveryPlaces(regionId: string, usingFallback: boolean) {
  if (usingFallback || regionId.startsWith("fallback")) {
    return { places: fallbackPlaces(regionId), error: null };
  }

  const { data, error } = await supabase
    .from("discovery_places")
    .select(
      "id, region_id, slug, name, category, latitude, longitude, short_description, official_summary, hero_image_url, official_url, sort_order"
    )
    .eq("region_id", regionId)
    .order("sort_order", { ascending: true });

  if (error) {
    if (isDiscoveryRelationMissing(error)) {
      return { places: fallbackPlaces(regionId), error: null };
    }

    return { places: fallbackPlaces(regionId), error: error.message };
  }

  if (!data?.length) {
    return { places: fallbackPlaces(regionId), error: null };
  }

  return { places: data.map((row) => mapPlaceRow(row as Record<string, unknown>)), error: null };
}

export async function loadPlaceContent(placeId: string) {
  if (placeId.startsWith("fallback-")) {
    return { posts: [] as DiscoveryPlacePost[], error: null };
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, user_id, content, content_kind, media_url, media_type, image_url, video_url, created_at, expires_at, profiles(username, avatar_url, is_ai_guide, is_official)"
    )
    .eq("discovery_place_id", placeId)
    .eq("visibility", "public")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    if (isDiscoveryRelationMissing(error)) {
      return { posts: [] as DiscoveryPlacePost[], error: null };
    }

    return { posts: [] as DiscoveryPlacePost[], error: error.message };
  }

  return { posts: (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>)), error: null };
}

export async function loadPlaceComments(placeId: string) {
  if (placeId.startsWith("fallback-")) {
    return { comments: [] as DiscoveryPlaceComment[], error: null };
  }

  const { data, error } = await supabase
    .from("discovery_place_comments")
    .select("id, place_id, user_id, content, created_at, profiles(username, avatar_url)")
    .eq("place_id", placeId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    if (isDiscoveryRelationMissing(error)) {
      return { comments: [] as DiscoveryPlaceComment[], error: null };
    }

    return { comments: [] as DiscoveryPlaceComment[], error: error.message };
  }

  return { comments: (data ?? []).map((row) => mapCommentRow(row as Record<string, unknown>)), error: null };
}

export async function addPlaceComment(placeId: string, userId: string, content: string) {
  const { data, error } = await supabase
    .from("discovery_place_comments")
    .insert({ place_id: placeId, user_id: userId, content })
    .select("id, place_id, user_id, content, created_at, profiles(username, avatar_url)")
    .single();

  return {
    comment: data ? mapCommentRow(data as Record<string, unknown>) : null,
    error: error?.message ?? null,
  };
}

export async function loadPlaceSaved(userId: string | null, placeId: string) {
  if (!userId || placeId.startsWith("fallback-")) {
    return { saved: false, error: null };
  }

  const { data, error } = await supabase
    .from("discovery_place_saves")
    .select("place_id")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .maybeSingle();

  if (error && isDiscoveryRelationMissing(error)) {
    return { saved: false, error: null };
  }

  return { saved: Boolean(data), error: error?.message ?? null };
}

export async function togglePlaceSaved(userId: string, placeId: string, currentlySaved: boolean) {
  if (placeId.startsWith("fallback-")) {
    return { saved: currentlySaved, error: "Run the discovery map migration and seed to save places." };
  }

  if (currentlySaved) {
    const { error } = await supabase.from("discovery_place_saves").delete().eq("user_id", userId).eq("place_id", placeId);

    return { saved: false, error: error?.message ?? null };
  }

  const { error } = await supabase.from("discovery_place_saves").insert({ user_id: userId, place_id: placeId });

  return { saved: true, error: error?.message ?? null };
}

export async function createPlaceContent(
  userId: string,
  placeId: string,
  content: string,
  contentKind: "post" | "story" | "video",
  mediaUrl: string | null,
  mediaType: string | null
) {
  if (placeId.startsWith("fallback-")) {
    return { post: null, error: "Run the discovery map migration and seed to publish place content." };
  }

  const expiresAt =
    contentKind === "story" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;

  const row = {
    user_id: userId,
    content,
    visibility: "public" as const,
    discovery_place_id: placeId,
    content_kind: contentKind,
    media_url: mediaUrl,
    media_type: mediaType,
    image_url: mediaUrl && mediaType === "image" ? mediaUrl : null,
    video_url: mediaUrl && mediaType === "video" ? mediaUrl : null,
    expires_at: expiresAt,
  };

  const { data, error } = await supabase
    .from("posts")
    .insert(row)
    .select(
      "id, user_id, content, content_kind, media_url, media_type, image_url, video_url, created_at, expires_at, profiles(username, avatar_url, is_ai_guide, is_official)"
    )
    .single();

  return {
    post: data ? mapPostRow(data as Record<string, unknown>) : null,
    error: error?.message ?? null,
  };
}

export function getPostDisplayMedia(post: DiscoveryPlacePost) {
  if (post.media_url) {
    return {
      url: post.media_url,
      type: post.media_type === "video" ? ("video" as const) : ("image" as const),
    };
  }

  if (post.video_url) {
    return { url: post.video_url, type: "video" as const };
  }

  if (post.image_url) {
    return { url: post.image_url, type: "image" as const };
  }

  return null;
}
