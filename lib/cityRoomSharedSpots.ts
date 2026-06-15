import type { FeedSpotRow } from "@/lib/feed";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { inferSpotRegionFromAddress } from "@/lib/spotLocationDisplay";
import { supabase } from "@/lib/supabaseClient";

export type CityRoomContext = {
  cityId: string;
  cityName: string;
  citySlug: string;
};

type SharedSpotRow = FeedSpotRow & {
  city_id?: string | null;
  spot_canton?: string | null;
  spot_region?: string | null;
};

const SHARED_SPOTS_SELECT = `
  id,
  user_id,
  content,
  content_kind,
  image_url,
  video_url,
  video_cover_url,
  thumbnail_url,
  media_url,
  media_type,
  visibility,
  visited_count,
  comments_count,
  collection_save_count,
  created_at,
  spot_latitude,
  spot_longitude,
  spot_address,
  spot_city,
  spot_country,
  spot_name,
  profiles!posts_user_id_fkey!inner (
    username,
    avatar_url,
    is_private,
    is_demo
  )
`;

function normalizeMatchValue(value: string) {
  return value.trim().toLowerCase();
}

/** City name/slug variants for matching (Bern, bern, etc.). */
export function buildCityMatchVariants(cityName: string, citySlug: string) {
  const normalizedSlug = citySlug.replace(/-/g, " ").trim();

  return Array.from(
    new Set(
      [
        cityName,
        citySlug,
        normalizedSlug,
        normalizedSlug
          .split(/\s+/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
      ]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function valueMatchesVariants(value: string | null | undefined, variants: string[]) {
  const normalized = value?.trim();

  if (!normalized) {
    return false;
  }

  const haystack = normalizeMatchValue(normalized);

  return variants.some((variant) => {
    const needle = normalizeMatchValue(variant);

    if (!needle) {
      return false;
    }

    return haystack === needle || haystack.includes(needle) || needle.includes(haystack);
  });
}

function mapSharedSpotRow(row: Record<string, unknown>): SharedSpotRow {
  const profileJoin = row.profiles as
    | {
        username?: string;
        avatar_url?: string | null;
        is_private?: boolean;
        is_demo?: boolean;
      }
    | {
        username?: string;
        avatar_url?: string | null;
        is_private?: boolean;
        is_demo?: boolean;
      }[]
    | null;
  const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    content: String(row.content ?? ""),
    content_kind: (row.content_kind as string | null) ?? null,
    created_at: String(row.created_at),
    visibility: (row.visibility as FeedSpotRow["visibility"]) ?? "public",
    media_url: (row.media_url as string | null) ?? null,
    media_type: (row.media_type as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    video_cover_url: (row.video_cover_url as string | null) ?? null,
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    spot_latitude: row.spot_latitude != null ? Number(row.spot_latitude) : null,
    spot_longitude: row.spot_longitude != null ? Number(row.spot_longitude) : null,
    spot_address: (row.spot_address as string | null) ?? null,
    spot_city: (row.spot_city as string | null) ?? null,
    spot_country: (row.spot_country as string | null) ?? null,
    spot_name: (row.spot_name as string | null) ?? null,
    city_id: (row.city_id as string | null) ?? null,
    spot_canton: (row.spot_canton as string | null) ?? null,
    spot_region: (row.spot_region as string | null) ?? null,
    discovery_place_id: null,
    discovery_places: null,
    profiles: {
      username: publicProfileUsername(profile?.username),
      avatar_url: profile?.avatar_url ?? null,
      is_private: Boolean(profile?.is_private),
      is_demo: Boolean(profile?.is_demo),
    },
  };
}

/** Label for “{username} shared a Spot in {place}”. */
export function getSharedSpotPlaceLabel(spot: Pick<SharedSpotRow, "spot_name" | "spot_city" | "spot_address">) {
  const fromName = spot.spot_name?.trim();
  const fromCity = spot.spot_city?.trim();
  const fromAddress = spot.spot_address?.split(",")[0]?.trim();

  return fromName || fromCity || fromAddress || "this area";
}

export function spotMatchesCityRoom(spot: SharedSpotRow, room: CityRoomContext) {
  const variants = buildCityMatchVariants(room.cityName, room.citySlug);

  if (spot.city_id?.trim() && spot.city_id === room.cityId) {
    return true;
  }

  if (valueMatchesVariants(spot.spot_city, variants)) {
    return true;
  }

  if (valueMatchesVariants(spot.spot_canton, variants) || valueMatchesVariants(spot.spot_region, variants)) {
    return true;
  }

  const region = inferSpotRegionFromAddress({
    address: spot.spot_address,
    city: spot.spot_city,
    country: spot.spot_country,
  });

  if (valueMatchesVariants(region, variants)) {
    return true;
  }

  if (valueMatchesVariants(spot.spot_address, variants)) {
    return true;
  }

  return false;
}

export async function loadCityRoomSharedSpots(
  room: CityRoomContext
): Promise<{ spots: FeedSpotRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("posts")
    .select(SHARED_SPOTS_SELECT)
    .eq("content_kind", "spot")
    .eq("visibility", "public")
    .eq("profiles.is_private", false)
    .eq("profiles.is_demo", false)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return { spots: [], error: error.message || "Unable to load shared spots." };
  }

  const rows = (data ?? []).map((row) => mapSharedSpotRow(row as Record<string, unknown>));
  const matched = rows.filter(
    (spot) => spotMatchesCityRoom(spot, room) && !isGuideAccountUsername(spot.profiles.username)
  );

  return { spots: matched.slice(0, 24), error: null };
}
