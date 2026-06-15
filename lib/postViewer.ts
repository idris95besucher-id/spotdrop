import type { FeedSpotRow } from "@/lib/feed";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";
import type { PostMediaFields } from "@/lib/posts";
import { normalizeSpotPublicStats, type SpotPublicStats } from "@/lib/spotRanking";
import type { ProfileContentPost } from "@/lib/profileContent";

export type ViewerPostAuthor = {
  username: string;
  avatar_url?: string | null;
};

/** Minimal post shape for vertical viewer list + preview while detail loads. */
export type ViewerPostListItem = PostMediaFields & {
  id: string;
  user_id: string;
  content?: string | null;
  created_at: string;
  content_kind?: string | null;
  spot_name?: string | null;
  spot_address?: string | null;
  spot_city?: string | null;
  spot_country?: string | null;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  discovery_place_id?: string | null;
  visited_count?: number;
  comments_count?: number;
  collection_save_count?: number;
  saved_count?: number;
  profiles?: ViewerPostAuthor | null;
  discovery_places?: { name?: string } | { name?: string }[] | null;
};

export function getViewerSpotMediaUrl(spot: Pick<ViewerPostListItem, "media_url" | "video_url" | "image_url">) {
  return spot.media_url?.trim() || spot.video_url?.trim() || spot.image_url?.trim() || null;
}

export function feedRowToViewerItem(row: FeedSpotRow): ViewerPostListItem {
  return {
    id: row.id,
    user_id: row.user_id,
    content: row.content,
    created_at: row.created_at,
    content_kind: row.content_kind,
    image_url: row.image_url,
    video_url: row.video_url,
    video_cover_url: row.video_cover_url,
    thumbnail_url: row.thumbnail_url,
    media_url: row.media_url,
    media_type: row.media_type,
    spot_name: row.spot_name,
    spot_address: row.spot_address,
    spot_city: row.spot_city,
    spot_country: row.spot_country,
    spot_latitude: row.spot_latitude,
    spot_longitude: row.spot_longitude,
    discovery_place_id: row.discovery_place_id,
    ...normalizeSpotPublicStats(row),
    profiles: {
      username: row.profiles.username,
      avatar_url: row.profiles.avatar_url,
    },
    discovery_places: row.discovery_places,
  };
}

export function feedRowsToViewerItems(rows: FeedSpotRow[]): ViewerPostListItem[] {
  return rows.map(feedRowToViewerItem);
}

function mediaUrlsMatch(
  spot: Pick<ViewerPostListItem, "media_url" | "video_url" | "image_url">,
  mediaUrl: string
) {
  const target = mediaUrl.trim();

  return (
    spot.media_url?.trim() === target ||
    spot.video_url?.trim() === target ||
    spot.image_url?.trim() === target ||
    getViewerSpotMediaUrl(spot) === target
  );
}

/** Find index in the frozen viewer list — same array order as the grid. */
export function findViewerIndexForSpot(
  items: ViewerPostListItem[],
  spotId: unknown,
  mediaUrl?: string | null
): number {
  const targetId = normalizePostId(spotId);

  if (!targetId || items.length === 0) {
    if (targetId) {
      console.warn("viewer: empty list for spot id", targetId);
    }

    return 0;
  }

  const normalizedMedia = mediaUrl?.trim() || null;

  if (normalizedMedia) {
    const exactIndex = items.findIndex(
      (spot) => postIdsEqual(spot.id, targetId) && mediaUrlsMatch(spot, normalizedMedia)
    );

    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  const byIdIndex = items.findIndex((spot) => postIdsEqual(spot.id, targetId));

  if (byIdIndex >= 0) {
    return byIdIndex;
  }

  console.warn("viewer: spot not in frozen list, fallback to 0", targetId, normalizedMedia);
  return 0;
}

export function profilePostToViewerItem(
  post: ProfileContentPost,
  author: ViewerPostAuthor
): ViewerPostListItem {
  const id = normalizePostId(post.id)!;

  return {
    id,
    user_id: post.user_id,
    content: post.content,
    created_at: post.created_at,
    content_kind: post.content_kind,
    image_url: post.image_url,
    video_url: post.video_url,
    video_cover_url: post.video_cover_url,
    thumbnail_url: post.thumbnail_url,
    media_url: post.media_url,
    media_type: post.media_type,
    spot_name: post.spot_name,
    spot_address: post.spot_address,
    spot_city: post.spot_city,
    spot_country: post.spot_country,
    spot_latitude: post.spot_latitude,
    spot_longitude: post.spot_longitude,
    discovery_place_id: post.discovery_place_id,
    ...normalizeSpotPublicStats(post),
    profiles: author,
    discovery_places: post.place_name ? { name: post.place_name } : null,
  };
}

/** Same order as profile grid — no dedupe/reorder. */
export function profilePostsToViewerItems(
  posts: ProfileContentPost[],
  author: ViewerPostAuthor
): ViewerPostListItem[] {
  const items: ViewerPostListItem[] = [];

  for (const post of posts) {
    const id = normalizePostId(post.id);

    if (!id) {
      continue;
    }

    items.push(profilePostToViewerItem(post, author));
  }

  return items;
}
