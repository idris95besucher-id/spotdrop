import { normalizePostId } from "@/lib/postIds";
import { isExplorePublishedSpot } from "@/lib/publishedToSpots";
import { normalizeSpotPublicStats } from "@/lib/spotRanking";
import { supabase } from "@/lib/supabaseClient";

export type ProfileContentPost = {
  id: string;
  user_id: string;
  content: string;
  visibility?: "public" | "private" | null;
  published_to_spots?: boolean | null;
  image_url?: string | null;
  video_url?: string | null;
  video_cover_url?: string | null;
  thumbnail_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  updated_at?: string;
  discovery_place_id?: string | null;
  content_kind?: string | null;
  spot_name?: string | null;
  place_name?: string | null;
  place_slug?: string | null;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  spot_address?: string | null;
  spot_city?: string | null;
  spot_country?: string | null;
  location_label?: string | null;
  visited_count?: number;
  comments_count?: number;
  collection_save_count?: number;
  saved_count?: number;
};

export type ProfileContentBuckets = {
  personal: ProfileContentPost[];
  /** Public discovery spots only (for profile Spots tab). */
  spotPosts: ProfileContentPost[];
  error: string | null;
};

const POST_SELECT =
  "id, user_id, content, visibility, published_to_spots, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, updated_at, discovery_place_id, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, visited_count, comments_count, collection_save_count";

const POST_SELECT_NO_VIDEO_COVER =
  "id, user_id, content, visibility, image_url, video_url, thumbnail_url, media_url, media_type, created_at, updated_at, discovery_place_id, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country";

const POST_SELECT_NO_THUMBNAIL =
  "id, user_id, content, visibility, image_url, video_url, media_url, media_type, created_at, updated_at, discovery_place_id, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country";

const POST_SELECT_LEGACY =
  "id, user_id, content, visibility, image_url, video_url, media_url, media_type, created_at, updated_at, discovery_place_id";

const POST_SELECT_WITH_PLACE = `${POST_SELECT}, discovery_places ( name, slug )`;

const POST_SELECT_WITH_PLACE_NO_VIDEO_COVER = `${POST_SELECT_NO_VIDEO_COVER}, discovery_places ( name, slug )`;

const POST_SELECT_WITH_PLACE_NO_THUMBNAIL = `${POST_SELECT_NO_THUMBNAIL}, discovery_places ( name, slug )`;

function isStoryKind(kind: string | null | undefined) {
  return kind === "story";
}

function hasSpotCoordinates(row: ProfileContentPost) {
  const latitude = row.spot_latitude;
  const longitude = row.spot_longitude;

  return (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

/** Posts tab: explicit post or legacy rows without content_kind (unless geo spot). */
export function isProfilePost(row: ProfileContentPost) {
  if (isStoryKind(row.content_kind)) {
    return false;
  }

  if (isProfileSpot(row)) {
    return false;
  }

  const kind = row.content_kind?.trim();

  if (!kind || kind === "post") {
    return true;
  }

  return kind !== "spot" && kind !== "story";
}

/**
 * Spots: content_kind spot, or legacy geo rows (coords) without explicit post kind.
 * discovery_place_id alone does not make a spot — avoids hiding old posts.
 */
export function isProfileSpot(row: ProfileContentPost) {
  if (isStoryKind(row.content_kind)) {
    return false;
  }

  if (row.content_kind === "post") {
    return false;
  }

  if (row.content_kind === "spot") {
    return true;
  }

  const kind = row.content_kind?.trim();

  if (!kind && hasSpotCoordinates(row)) {
    return true;
  }

  return false;
}

export function splitProfilePosts(rows: ProfileContentPost[]) {
  const personal: ProfileContentPost[] = [];
  const spotPosts: ProfileContentPost[] = [];

  for (const row of rows) {
    if (isStoryKind(row.content_kind)) {
      continue;
    }

    if (isProfileSpot(row)) {
      if (isExplorePublishedSpot(row)) {
        spotPosts.push(row);
      }
      continue;
    }

    if (isProfilePost(row)) {
      personal.push(row);
      continue;
    }

    personal.push(row);
  }

  return { personal, spotPosts };
}

function mapRow(row: Record<string, unknown>): ProfileContentPost {
  const place = row.discovery_places as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null;

  const placeRecord = Array.isArray(place) ? place[0] : place;

  const id = normalizePostId(row.id);

  if (!id) {
    console.warn("profile post row missing id", row);
  }

  return {
    id: id ?? "",
    user_id: String(row.user_id),
    content: String(row.content ?? ""),
    visibility: (row.visibility as ProfileContentPost["visibility"]) ?? null,
    published_to_spots: row.published_to_spots as boolean | null | undefined,
    image_url: (row.image_url as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    video_cover_url: (row.video_cover_url as string | null) ?? null,
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    media_url: (row.media_url as string | null) ?? null,
    media_type: (row.media_type as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    discovery_place_id: (row.discovery_place_id as string | null) ?? null,
    content_kind: (row.content_kind as string | null) ?? null,
    spot_name: (row.spot_name as string | null) ?? null,
    place_name: placeRecord?.name ?? null,
    place_slug: placeRecord?.slug ?? null,
    spot_latitude: row.spot_latitude != null ? Number(row.spot_latitude) : null,
    spot_longitude: row.spot_longitude != null ? Number(row.spot_longitude) : null,
    spot_address: (row.spot_address as string | null) ?? null,
    spot_city: (row.spot_city as string | null) ?? null,
    spot_country: (row.spot_country as string | null) ?? null,
    location_label: buildLocationLabel(row, placeRecord?.name ?? null),
    ...normalizeSpotPublicStats({
      visited_count: row.visited_count as number | null | undefined,
      comments_count: row.comments_count as number | null | undefined,
      collection_save_count: row.collection_save_count as number | null | undefined,
    }),
  };
}

function buildLocationLabel(row: Record<string, unknown>, placeName: string | null) {
  const spotName = row.spot_name;

  if (typeof spotName === "string" && spotName.trim()) {
    return spotName.trim();
  }

  if (placeName) {
    return placeName;
  }

  const parts = [row.spot_address, row.spot_city, row.spot_country].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0
  );

  if (parts.length > 0) {
    return parts.join(", ");
  }

  if (row.spot_latitude != null && row.spot_longitude != null) {
    return `${Number(row.spot_latitude).toFixed(4)}, ${Number(row.spot_longitude).toFixed(4)}`;
  }

  return null;
}

export function getSpotDisplayLabel(post: ProfileContentPost) {
  if (post.spot_name?.trim()) {
    return post.spot_name.trim();
  }

  return post.location_label?.trim() || post.place_name?.trim() || null;
}

export function getSpotLocationLine(post: ProfileContentPost) {
  const parts = [post.spot_address, post.spot_city, post.spot_country].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0
  );

  if (parts.length > 0) {
    return parts.join(", ");
  }

  if (post.spot_latitude != null && post.spot_longitude != null) {
    return `${Number(post.spot_latitude).toFixed(4)}, ${Number(post.spot_longitude).toFixed(4)}`;
  }

  return post.place_name?.trim() || null;
}

function isSchemaFallbackError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "42703" || error.code === "PGRST200";
}

async function queryUserPosts(userId: string, select: string, publicOnly: boolean) {
  let query = supabase.from("posts").select(select).eq("user_id", userId).order("created_at", { ascending: false });

  if (publicOnly) {
    query = query.eq("visibility", "public");
  }

  return query;
}

async function loadUserPostsWithFallback(userId: string, publicOnly: boolean): Promise<ProfileContentBuckets> {
  const selectors = [
    POST_SELECT_WITH_PLACE,
    POST_SELECT_WITH_PLACE_NO_VIDEO_COVER,
    POST_SELECT_WITH_PLACE_NO_THUMBNAIL,
    POST_SELECT,
    POST_SELECT_NO_VIDEO_COVER,
    POST_SELECT_NO_THUMBNAIL,
    POST_SELECT_LEGACY,
  ];

  let lastError: string | null = null;

  for (const select of selectors) {
    const { data, error } = await queryUserPosts(userId, select, publicOnly);

    if (!error) {
      const rows = (data ?? [])
        .map((row) => mapRow(row as unknown as Record<string, unknown>))
        .filter((row) => Boolean(normalizePostId(row.id)));
      const buckets = splitProfilePosts(rows);

      return {
        ...buckets,
        error: null,
      };
    }

    lastError = error.message || "Unable to load profile content.";

    if (!isSchemaFallbackError(error)) {
      break;
    }
  }

  return {
    personal: [],
    spotPosts: [],
    error: lastError,
  };
}

export async function loadOwnProfileContent(userId: string): Promise<ProfileContentBuckets> {
  return loadUserPostsWithFallback(userId, false);
}

export async function loadPublicProfileContent(userId: string): Promise<ProfileContentBuckets> {
  return loadUserPostsWithFallback(userId, true);
}

export function getProfilePostMedia(post: ProfileContentPost) {
  if (post.media_url) {
    return {
      mediaUrl: post.media_url,
      mediaType: post.media_type ?? (post.video_url ? "video" : "image"),
    };
  }

  if (post.video_url) {
    return { mediaUrl: post.video_url, mediaType: "video" };
  }

  if (post.image_url) {
    return { mediaUrl: post.image_url, mediaType: "image" };
  }

  return { mediaUrl: null, mediaType: null };
}

export function formatProfilePostTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
