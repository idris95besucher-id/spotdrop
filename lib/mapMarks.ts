import { publicProfileUsername } from "@/lib/publicProfile";
import { uploadPostMedia } from "@/lib/postMedia";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { supabase } from "@/lib/supabaseClient";

export type MapMark = {
  id: string;
  user_id: string;
  text: string;
  photo_url: string | null;
  latitude: number;
  longitude: number;
  place_name: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
  username: string;
  avatar_url: string | null;
};

export type MapMarkInput = {
  userId: string;
  text: string;
  photoFile?: File | null;
  location: SpotGeoLocation;
  placeName: string;
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
  created_at,
  updated_at,
  ${MAP_MARK_AUTHOR_PROFILES}(username, avatar_url, is_private, is_demo)
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

function mapRowToMark(row: Record<string, unknown>): MapMark | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const profileJoin = row.profiles as
    | { username?: string; avatar_url?: string | null; is_private?: boolean; is_demo?: boolean }
    | { username?: string; avatar_url?: string | null; is_private?: boolean; is_demo?: boolean }[]
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
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    username: publicProfileUsername(profile?.username),
    avatar_url: profile?.avatar_url ?? null,
  };
}

export async function loadMapMarks(limit = 400) {
  const { data, error } = await supabase
    .from("map_marks")
    .select(MAP_MARK_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error)) {
      return { marks: [] as MapMark[], error: "TABLE_MISSING" as const };
    }

    return { marks: [] as MapMark[], error: error.message };
  }

  const marks: MapMark[] = [];

  for (const row of data ?? []) {
    const mark = mapRowToMark(row as unknown as Record<string, unknown>);

    if (mark) {
      marks.push(mark);
    }
  }

  return { marks, error: null };
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

  const placeName =
    input.placeName.trim() ||
    input.location.address?.trim() ||
    [input.location.city, input.location.country].filter(Boolean).join(", ") ||
    null;

  const { data, error } = await supabase
    .from("map_marks")
    .insert({
      user_id: input.userId,
      text,
      photo_url: photoUrl,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      place_name: placeName,
      address: input.location.address?.trim() || null,
    })
    .select(MAP_MARK_SELECT)
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return { mark: null as MapMark | null, error: "TABLE_MISSING" as const };
    }

    return { mark: null as MapMark | null, error: error.message };
  }

  return { mark: mapRowToMark(data as unknown as Record<string, unknown>), error: null };
}

export async function updateMapMark(
  markId: string,
  userId: string,
  input: { text: string; photoFile?: File | null; clearPhoto?: boolean }
) {
  const text = input.text.trim();

  if (!text) {
    return { mark: null as MapMark | null, error: "Text is required." };
  }

  const patch: Record<string, unknown> = {
    text,
    updated_at: new Date().toISOString(),
  };

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

  const { data, error } = await supabase
    .from("map_marks")
    .update(patch)
    .eq("id", markId)
    .eq("user_id", userId)
    .select(MAP_MARK_SELECT)
    .single();

  if (error) {
    return { mark: null as MapMark | null, error: error.message };
  }

  return { mark: mapRowToMark(data as unknown as Record<string, unknown>), error: null };
}

export async function deleteMapMark(markId: string, userId: string) {
  const { error } = await supabase.from("map_marks").delete().eq("id", markId).eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
