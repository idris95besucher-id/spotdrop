import {
  BERN_DISCOVERY_PLACES_FALLBACK,
  BERN_DISCOVERY_REGION_SLUG,
  BERN_MAP_BOUNDS,
  type DiscoveryPlace,
  type MapBounds,
} from "@/lib/discoveryMap";
import { formatSpotLocationDisplay } from "@/lib/spotLocationDisplay";
import { haversineKm, type SpotGeoLocation } from "@/lib/spotLocation";
import { hasSpotPublishLocation, resolveSpotName, SPOT_LOCATION_REQUIRED_MESSAGE } from "@/lib/spotPublish";
import { POST_AUTHOR_PROFILES_INNER } from "@/lib/posts";
import { uploadPostMedia } from "@/lib/postMedia";
import { uploadVideoCoverForPublish } from "@/lib/publishVideoCover";
import { spotUploadTime } from "@/lib/spotUploadLog";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { addSpotToCollection, loadCollectionById, spotVisibilityForCollection } from "@/lib/collections";
import { supabase } from "@/lib/supabaseClient";

export type MapSpotPin = {
  id: string;
  user_id: string;
  username: string;
  latitude: number;
  longitude: number;
  spot_name: string | null;
  spot_address: string | null;
  spot_city: string | null;
  spot_country: string | null;
  label: string;
  location_line: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  video_cover_url: string | null;
  thumbnail_url: string | null;
  discovery_place_id: string | null;
};

const MAP_SPOT_SELECT =
  `id, user_id, media_url, media_type, image_url, video_cover_url, thumbnail_url, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id, discovery_places(name), ${POST_AUTHOR_PROFILES_INNER}(username, is_private, is_demo)`;

const MAP_SPOT_SELECT_LEGACY =
  `id, user_id, media_url, media_type, image_url, thumbnail_url, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id, ${POST_AUTHOR_PROFILES_INNER}(username, is_private, is_demo)`;

export type CreateSpotInput = {
  userId: string;
  file: File;
  mediaType: "image" | "video";
  spotName: string;
  location: SpotGeoLocation;
  /** Spots are always public for place discovery. */
  visibility?: "public";
  /** When user picks a map place manually, link this discovery place directly. */
  manualPlaceId?: string | null;
  /** JPEG frame chosen as video poster (videos only). */
  coverFile?: File | null;
  /** Optional collection to add this spot into after publish. */
  collectionId?: string | null;
  /** Skip discovery_regions query when places were preloaded in the camera flow. */
  discoveryPlaces?: DiscoveryPlace[];
  accessToken?: string;
  onMediaUploadProgress?: (percent: number) => void;
  onCoverUploadProgress?: (percent: number) => void;
};

const NEAREST_PLACE_KM = 8;

function isMissingSpotColumns(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" || message.includes("spot_latitude") || message.includes("spot_");
}

function isMissingSpotNameColumn(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "42703" && (error.message?.toLowerCase().includes("spot_name") ?? false);
}

export async function loadDiscoveryPlacesForMatching(): Promise<DiscoveryPlace[]> {
  const { data: region } = await supabase
    .from("discovery_regions")
    .select("id")
    .eq("slug", BERN_DISCOVERY_REGION_SLUG)
    .maybeSingle();

  if (!region?.id) {
    return BERN_DISCOVERY_PLACES_FALLBACK.map((place, index) => ({
      ...place,
      id: `fallback-${place.slug}`,
      region_id: "fallback-region",
      sort_order: place.sort_order || (index + 1) * 10,
    }));
  }

  const { data, error } = await supabase
    .from("discovery_places")
    .select("id, region_id, slug, name, category, latitude, longitude, short_description, official_summary, hero_image_url, official_url, sort_order")
    .eq("region_id", region.id);

  if (error || !data?.length) {
    return BERN_DISCOVERY_PLACES_FALLBACK.map((place, index) => ({
      ...place,
      id: `fallback-${place.slug}`,
      region_id: region.id,
      sort_order: place.sort_order || (index + 1) * 10,
    }));
  }

  return data.map((row) => ({
    id: String(row.id),
    region_id: String(row.region_id),
    slug: String(row.slug),
    name: String(row.name),
    category: row.category as DiscoveryPlace["category"],
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    short_description: row.short_description ?? null,
    official_summary: row.official_summary ?? null,
    hero_image_url: row.hero_image_url ?? null,
    official_url: row.official_url ?? null,
    sort_order: Number(row.sort_order ?? 0),
  }));
}

export function findNearestDiscoveryPlace(location: SpotGeoLocation, places: DiscoveryPlace[]) {
  let nearest: DiscoveryPlace | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const place of places) {
    const distance = haversineKm(location.latitude, location.longitude, place.latitude, place.longitude);

    if (distance < nearestDistance) {
      nearest = place;
      nearestDistance = distance;
    }
  }

  if (!nearest || nearestDistance > NEAREST_PLACE_KM || nearest.id.startsWith("fallback-")) {
    return null;
  }

  return nearest;
}

function isMissingVideoCoverColumn(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" &&
    (message.includes("video_cover_url") || message.includes("thumbnail_url"))
  );
}

function isInsertSelectError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "PGRST116" || error.message?.includes("JSON object requested") === true;
}

async function fetchInsertedPost(userId: string, mediaUrl: string) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, spot_name, media_url, video_url, thumbnail_url, video_cover_url, media_type, image_url")
    .eq("user_id", userId)
    .eq("media_url", mediaUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

export async function createGeoSpot(input: CreateSpotInput) {
  if (!hasSpotPublishLocation(input.location)) {
    return { postId: null, matchedPlace: null, error: SPOT_LOCATION_REQUIRED_MESSAGE };
  }

  const uploadOptions = {
    accessToken: input.accessToken,
  };

  let upload: Awaited<ReturnType<typeof uploadPostMedia>>;
  let videoCoverUrl: string | null = null;

  try {
    const finishMediaUpload = spotUploadTime("storage media");
    upload = await uploadPostMedia(input.userId, input.file, {
      ...uploadOptions,
      onProgress: input.onMediaUploadProgress,
    });
    finishMediaUpload();

    if (input.mediaType === "video") {
      const finishCoverUpload = spotUploadTime("storage cover");
      videoCoverUrl = await uploadVideoCoverForPublish(input.userId, input.file, input.coverFile ?? null, {
        ...uploadOptions,
        onProgress: input.onCoverUploadProgress,
      });
      finishCoverUpload();
    } else {
      input.onCoverUploadProgress?.(100);
    }
  } catch (uploadError) {
    const message = uploadError instanceof Error ? uploadError.message : "Unable to upload media.";
    console.log("UPLOAD FILE RESULT", { step: "createGeoSpot", failed: true, error: message });
    return { postId: null, matchedPlace: null, error: message };
  }

  const finishLocation = spotUploadTime("location");
  const places =
    input.discoveryPlaces && input.discoveryPlaces.length > 0
      ? input.discoveryPlaces
      : await loadDiscoveryPlacesForMatching();
  finishLocation();

  const manualPlace =
    input.manualPlaceId && !input.manualPlaceId.startsWith("fallback-")
      ? places.find((place) => place.id === input.manualPlaceId) ?? null
      : null;
  const matchedPlace = manualPlace ?? findNearestDiscoveryPlace(input.location, places);

  const inCollection = Boolean(input.collectionId);
  let spotVisibility: "public" | "private" = "public";
  let publishedToSpots = true;

  if (inCollection) {
    publishedToSpots = false;
    const { collection } = await loadCollectionById(input.collectionId!);

    if (collection && collection.user_id === input.userId) {
      spotVisibility = spotVisibilityForCollection(collection.visibility);
    } else {
      spotVisibility = "private";
    }
  }

  const row = {
    user_id: input.userId,
    content: "",
    spot_name: resolveSpotName(input.spotName),
    visibility: spotVisibility,
    published_to_spots: publishedToSpots,
    content_kind: "spot" as const,
    media_url: upload.mediaUrl,
    media_type: upload.mediaType,
    image_url: upload.mediaType === "image" ? upload.mediaUrl : videoCoverUrl,
    video_url: upload.mediaType === "video" ? upload.mediaUrl : null,
    video_cover_url: videoCoverUrl,
    thumbnail_url: videoCoverUrl,
    discovery_place_id: matchedPlace?.id ?? null,
    spot_latitude: input.location.latitude,
    spot_longitude: input.location.longitude,
    spot_address: input.location.address,
    spot_city: input.location.city,
    spot_country: input.location.country,
  };

  console.log("POST INSERT payload", {
    storage_path: upload.storagePath,
    media_url: row.media_url,
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url,
    video_cover_url: row.video_cover_url,
    spot_name: row.spot_name,
    media_type: row.media_type,
  });

  const finishDbInsert = spotUploadTime("db insert");

  try {
    let insertRow: typeof row | Omit<typeof row, "video_cover_url" | "thumbnail_url"> = row;
    let { error: insertError } = await supabase.from("posts").insert(insertRow);

    if (insertError && isMissingVideoCoverColumn(insertError)) {
      const {
        video_cover_url: _videoCover,
        thumbnail_url: _thumb,
        ...legacyRow
      } = row;
      insertRow = legacyRow;
      const retry = await supabase.from("posts").insert(legacyRow);
      insertError = retry.error;
    }

    let { data, error: fetchError } = await fetchInsertedPost(input.userId, upload.mediaUrl);

    if (!data && !fetchError && insertError && isInsertSelectError(insertError)) {
      ({ data, error: fetchError } = await fetchInsertedPost(input.userId, upload.mediaUrl));
    }

    console.log("POST INSERT RESULT", {
      insertError,
      fetchError,
      storage_path: upload.storagePath,
      media_url: data?.media_url ?? row.media_url,
      video_url: data?.video_url ?? row.video_url,
      thumbnail_url: data?.thumbnail_url ?? row.thumbnail_url,
      video_cover_url: data?.video_cover_url ?? row.video_cover_url,
      spot_name: data?.spot_name ?? row.spot_name,
      media_type: data?.media_type ?? row.media_type,
      postId: data?.id ?? null,
    });

    if (insertError && !data) {
      if (isMissingSpotNameColumn(insertError)) {
        return {
          postId: null,
          matchedPlace,
          error: "Run database/add-spot-name.sql in Supabase to enable spot names.",
        };
      }

      if (isMissingSpotColumns(insertError)) {
        return {
          postId: null,
          matchedPlace,
          error: "Run database/add-spot-location.sql in Supabase to enable geo spots.",
        };
      }

      return { postId: null, matchedPlace, error: insertError.message };
    }

    if (fetchError && !data) {
      return {
        postId: null,
        matchedPlace,
        error: fetchError.message || "Post was saved but could not be loaded.",
      };
    }

    const postId = data?.id ? String(data.id) : null;

    if (!postId) {
      return {
        postId: null,
        matchedPlace,
        error: "Post insert succeeded but no id was returned.",
      };
    }

    if (postId && input.collectionId) {
      const addResult = await addSpotToCollection(input.collectionId, postId, input.userId);

      if (addResult.error) {
        console.warn("POST INSERT collection add failed (non-fatal)", {
          postId,
          collectionId: input.collectionId,
          error: addResult.error,
        });
      }
    }

    return { postId, matchedPlace, error: null };
  } finally {
    finishDbInsert();
  }
}

function withinBounds(lat: number, lng: number, bounds: MapBounds) {
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

function mapRowToMapSpotPin(row: Record<string, unknown>): MapSpotPin | null {
  const latitude = Number(row.spot_latitude);
  const longitude = Number(row.spot_longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const profileJoin = row.profiles as
    | { username?: string; is_private?: boolean; is_demo?: boolean }
    | { username?: string; is_private?: boolean; is_demo?: boolean }[]
    | null;
  const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;

  if (profile?.is_private || profile?.is_demo || isGuideAccountUsername(profile?.username)) {
    return null;
  }

  const placeJoin = row.discovery_places as { name?: string } | { name?: string }[] | null;
  const placeName = Array.isArray(placeJoin) ? placeJoin[0]?.name : placeJoin?.name;
  const spotName = (row.spot_name as string | null)?.trim() || null;
  const locationLine = formatSpotLocationDisplay({
    spot_name: spotName,
    spot_address: row.spot_address as string | null,
    spot_city: row.spot_city as string | null,
    spot_country: row.spot_country as string | null,
    placeName: placeName ?? null,
  });
  const label = spotName || placeName || locationLine?.split(",")[0] || "Spot";
  const mediaTypeRaw = row.media_type as string | null;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    username: publicProfileUsername(profile?.username),
    latitude,
    longitude,
    spot_name: spotName,
    spot_address: (row.spot_address as string | null) ?? null,
    spot_city: (row.spot_city as string | null) ?? null,
    spot_country: (row.spot_country as string | null) ?? null,
    label: String(label),
    location_line: locationLine,
    media_url: (row.media_url as string | null) ?? null,
    media_type: mediaTypeRaw === "video" ? "video" : mediaTypeRaw === "image" ? "image" : null,
    video_cover_url:
      (row.video_cover_url as string | null) ??
      (row.thumbnail_url as string | null) ??
      (row.image_url as string | null) ??
      null,
    thumbnail_url:
      (row.video_cover_url as string | null) ??
      (row.thumbnail_url as string | null) ??
      (row.image_url as string | null) ??
      null,
    discovery_place_id: (row.discovery_place_id as string | null) ?? null,
  };
}

async function queryMapSpotPins(select: string, limit: number) {
  return supabase
    .from("posts")
    .select(select)
    .eq("content_kind", "spot")
    .eq("visibility", "public")
    .eq("published_to_spots", true)
    .not("spot_latitude", "is", null)
    .not("spot_longitude", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function loadNearbyMapSpotPins(
  latitude: number,
  longitude: number,
  radiusKm = 45,
  limit = 200
) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
  const bounds: MapBounds = {
    north: latitude + latDelta,
    south: latitude - latDelta,
    east: longitude + lngDelta,
    west: longitude - lngDelta,
  };

  const { pins, error } = await loadMapSpotPins(bounds, Math.max(limit, 240));

  if (error) {
    return { pins: [] as MapSpotPin[], error };
  }

  const nearby = pins
    .map((pin) => ({
      pin,
      distance: haversineKm(latitude, longitude, pin.latitude, pin.longitude),
    }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map(({ pin }) => pin);

  return { pins: nearby, error: null };
}

export async function loadMapSpotPins(bounds: MapBounds = BERN_MAP_BOUNDS, limit = 120) {
  let result = await queryMapSpotPins(MAP_SPOT_SELECT, limit);

  if (result.error && result.error.code === "42703") {
    result = await queryMapSpotPins(MAP_SPOT_SELECT_LEGACY, limit);
  }

  if (isMissingSpotColumns(result.error)) {
    result = await queryMapSpotPins(MAP_SPOT_SELECT_LEGACY, limit);
  }

  if (result.error) {
    if (isMissingSpotColumns(result.error)) {
      return { pins: [] as MapSpotPin[], error: null };
    }

    return { pins: [] as MapSpotPin[], error: result.error.message };
  }

  const pins: MapSpotPin[] = [];

  for (const row of result.data ?? []) {
    const pin = mapRowToMapSpotPin(row as unknown as Record<string, unknown>);

    if (!pin || !withinBounds(pin.latitude, pin.longitude, bounds)) {
      continue;
    }

    pins.push(pin);
  }

  return { pins, error: null };
}

export async function loadSavedMapSpotPinIds(userId: string) {
  const { data, error } = await supabase
    .from("post_reactions")
    .select("post_id")
    .eq("user_id", userId)
    .eq("reaction_type", "useful");

  if (error) {
    if (error.code === "42P01" || error.message?.includes("post_reactions")) {
      return { ids: [] as string[], error: null };
    }

    return { ids: [] as string[], error: error.message };
  }

  return { ids: (data ?? []).map((row) => String(row.post_id)), error: null };
}
