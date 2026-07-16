import type { ProfileContentPost } from "@/lib/profileContent";
import { formatSpotLocationDisplay } from "@/lib/spotLocationDisplay";
import { normalizeSpotPublicStats } from "@/lib/spotRanking";
import { toUserFacingError } from "@/lib/userFacingError";
import { supabase } from "@/lib/supabaseClient";

const MY_SPOTS_POST_SELECT =
  "id, user_id, content, visibility, published_to_spots, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, updated_at, discovery_place_id, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, visited_count, comments_count, collection_save_count";

function mapMySpotRow(row: Record<string, unknown>): ProfileContentPost {
  const stats = normalizeSpotPublicStats(row as never);
  const post: ProfileContentPost = {
    id: String(row.id),
    user_id: String(row.user_id),
    content: typeof row.content === "string" ? row.content : "",
    visibility: (row.visibility as ProfileContentPost["visibility"]) ?? null,
    published_to_spots: (row.published_to_spots as boolean | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    video_url: (row.video_url as string | null) ?? null,
    video_cover_url: (row.video_cover_url as string | null) ?? null,
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    media_url: (row.media_url as string | null) ?? null,
    media_type: (row.media_type as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: (row.updated_at as string | null) ?? undefined,
    discovery_place_id: row.discovery_place_id != null ? String(row.discovery_place_id) : null,
    content_kind: (row.content_kind as string | null) ?? null,
    spot_name: (row.spot_name as string | null) ?? null,
    spot_latitude: (row.spot_latitude as number | null) ?? null,
    spot_longitude: (row.spot_longitude as number | null) ?? null,
    spot_address: (row.spot_address as string | null) ?? null,
    spot_city: (row.spot_city as string | null) ?? null,
    spot_country: (row.spot_country as string | null) ?? null,
    visited_count: stats.visited_count,
    comments_count: stats.comments_count,
    collection_save_count: stats.saved_count,
    saved_count: stats.saved_count,
  };

  post.location_label = formatSpotLocationDisplay({
    spot_name: post.spot_name,
    spot_address: post.spot_address,
    spot_city: post.spot_city,
    spot_country: post.spot_country,
  });

  return post;
}

/**
 * Owner-only "My Spots" grid: the user's own Spots published with the private "My Spots"
 * destination (see lib/spotPublish.ts's SpotPublishDestination and lib/spots.ts's
 * publishToMySpots flag). This is a plain query over posts' own visibility/published_to_spots
 * fields — no join table, since these are the user's own posts, not bookmarks of someone
 * else's content. isExplorePublishedSpot() (lib/publishedToSpots.ts) already excludes these
 * rows from the public Posts/Spots grid because it requires visibility='public' AND
 * published_to_spots=true, so a post can only ever match one of the two grids, never both.
 */
export async function loadUserMySpots(userId: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(MY_SPOTS_POST_SELECT)
    .eq("user_id", userId)
    .eq("content_kind", "spot")
    .eq("visibility", "private")
    .eq("published_to_spots", false)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      posts: [] as ProfileContentPost[],
      error: toUserFacingError(error, "Unable to load My Spots."),
    };
  }

  const posts = (data ?? []).map((row) => mapMySpotRow(row as Record<string, unknown>));

  return { posts, error: null as string | null };
}
