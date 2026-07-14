import { postIdForQuery } from "@/lib/postIds";
import { loadFollowRelationship } from "@/lib/follows";
import { getProfilePostMedia, type ProfileContentPost } from "@/lib/profileContent";
import { publicProfileUsername } from "@/lib/publicProfile";
import { isMissingSpotRankingColumns, normalizeSpotPublicStats, refreshSpotPublicStatsEvent } from "@/lib/spotRanking";
import { supabase } from "@/lib/supabaseClient";

export type CollectionVisibility = "public" | "friends" | "invite" | "private";

export type SpotCollection = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  visibility: CollectionVisibility;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CollectionWithMeta = SpotCollection & {
  owner_username?: string;
  owner_avatar_url?: string | null;
  spot_count: number;
};

export const COLLECTION_VISIBILITY_OPTIONS: {
  value: CollectionVisibility;
  label: string;
  description: string;
}[] = [
  { value: "public", label: "Public", description: "Anyone can view this collection." },
  { value: "friends", label: "Friends Only", description: "Only mutual friends can view." },
  { value: "invite", label: "Invite Only", description: "Only people you invite can view." },
  { value: "private", label: "Private", description: "Only you can view." },
];

function isMissingCollectionsTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42P01" || message.includes("collections") || message.includes("add-collections");
}

export function collectionVisibilityLabel(visibility: CollectionVisibility) {
  return COLLECTION_VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.label ?? visibility;
}

/** Only public collections belong on Explore / community surfaces. */
export function isPublicCollectionVisibility(visibility: CollectionVisibility) {
  return visibility === "public";
}

/** Spots in non-public collections are not public discovery content. */
export function spotVisibilityForCollection(visibility: CollectionVisibility): "public" | "private" {
  return isPublicCollectionVisibility(visibility) ? "public" : "private";
}

export async function syncSpotVisibilityForCollection(
  postId: string,
  userId: string,
  collectionVisibility: CollectionVisibility
) {
  const visibility = spotVisibilityForCollection(collectionVisibility);

  const { error } = await supabase
    .from("posts")
    .update({
      visibility,
      published_to_spots: false,
    })
    .eq("id", postId)
    .eq("user_id", userId)
    .eq("content_kind", "spot");

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function canViewCollection(
  collection: SpotCollection,
  viewerId: string | null
): Promise<boolean> {
  if (!viewerId) {
    return collection.visibility === "public";
  }

  if (collection.user_id === viewerId) {
    return true;
  }

  if (collection.visibility === "public") {
    return true;
  }

  if (collection.visibility === "private") {
    return false;
  }

  if (collection.visibility === "friends") {
    const { data } = await loadFollowRelationship(viewerId, collection.user_id);
    return Boolean(data?.areFriends);
  }

  if (collection.visibility === "invite") {
    const { data } = await supabase
      .from("collection_members")
      .select("user_id")
      .eq("collection_id", collection.id)
      .eq("user_id", viewerId)
      .maybeSingle();

    return Boolean(data);
  }

  return false;
}

export async function loadCollectionById(collectionId: string) {
  const { data, error } = await supabase
    .from("collections")
    .select("id, user_id, name, description, visibility, cover_image_url, created_at, updated_at")
    .eq("id", collectionId)
    .maybeSingle();

  if (error) {
    if (isMissingCollectionsTable(error)) {
      return { collection: null, error: "Collections are temporarily unavailable. Please try again later." };
    }

    return { collection: null, error: error.message };
  }

  return { collection: (data as SpotCollection | null) ?? null, error: null };
}

/** Explore / Spots feed: public collections only. */
export async function loadExplorePublicCollections(limit = 40) {
  const { data, error } = await supabase
    .from("collections")
    .select("id, user_id, name, description, visibility, cover_image_url, created_at, updated_at")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingCollectionsTable(error)) {
      return { collections: [] as CollectionWithMeta[], error: null };
    }

    return { collections: [] as CollectionWithMeta[], error: error.message };
  }

  const rows = (data ?? []) as SpotCollection[];

  const withCounts = await Promise.all(
    rows.map(async (collection) => {
      const { count } = await supabase
        .from("collection_spots")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", collection.id);

      return {
        ...collection,
        spot_count: count ?? 0,
      } satisfies CollectionWithMeta;
    })
  );

  return { collections: withCounts, error: null };
}

export async function loadUserCollections(ownerId: string, viewerId: string | null) {
  const { data, error } = await supabase
    .from("collections")
    .select("id, user_id, name, description, visibility, cover_image_url, created_at, updated_at")
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingCollectionsTable(error)) {
      return { collections: [] as CollectionWithMeta[], error: null };
    }

    return { collections: [] as CollectionWithMeta[], error: error.message };
  }

  const rows = (data ?? []) as SpotCollection[];
  const visible: SpotCollection[] = [];

  for (const row of rows) {
    if (await canViewCollection(row, viewerId)) {
      visible.push(row);
    }
  }

  const withCounts = await Promise.all(
    visible.map(async (collection) => {
      const { count } = await supabase
        .from("collection_spots")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", collection.id);

      return {
        ...collection,
        spot_count: count ?? 0,
      } satisfies CollectionWithMeta;
    })
  );

  return { collections: withCounts, error: null };
}

export async function createCollection(input: {
  userId: string;
  name: string;
  description?: string;
  visibility: CollectionVisibility;
}) {
  const trimmedName = input.name.trim();

  if (!trimmedName) {
    return { collection: null, error: "Collection name is required." };
  }

  const { data, error } = await supabase
    .from("collections")
    .insert({
      user_id: input.userId,
      name: trimmedName,
      description: input.description?.trim() || null,
      visibility: input.visibility,
    })
    .select("id, user_id, name, description, visibility, cover_image_url, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingCollectionsTable(error)) {
      return { collection: null, error: "Collections are temporarily unavailable. Please try again later." };
    }

    return { collection: null, error: error.message };
  }

  return { collection: data as SpotCollection, error: null };
}

export async function addSpotToCollection(collectionId: string, postId: string, userId: string) {
  const { collection, error: loadError } = await loadCollectionById(collectionId);

  if (loadError || !collection) {
    return { error: loadError ?? "Collection not found." };
  }

  if (collection.user_id !== userId) {
    return { error: "You can only add spots to your own collections." };
  }

  const { error } = await supabase.from("collection_spots").insert({
    collection_id: collectionId,
    post_id: postId,
  });

  if (error && error.code !== "23505") {
    return { error: error.message };
  }

  await supabase
    .from("collections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", collectionId);

  await refreshSpotPublicStatsEvent(postId);

  return { error: null };
}

export async function removeSpotFromCollection(collectionId: string, postId: string, userId: string) {
  const { collection, error: loadError } = await loadCollectionById(collectionId);

  if (loadError || !collection) {
    return { error: loadError ?? "Collection not found." };
  }

  if (collection.user_id !== userId) {
    return { error: "You can only remove spots from your own collections." };
  }

  const { error } = await supabase
    .from("collection_spots")
    .delete()
    .eq("collection_id", collectionId)
    .eq("post_id", postIdForQuery(postId));

  if (error) {
    return { error: error.message };
  }

  await supabase
    .from("collections")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", collectionId);

  await refreshSpotPublicStatsEvent(postId);

  return { error: null };
}

export async function loadSpotCollectionSaveState(userId: string, postId: string) {
  const { collections, error: collectionsError } = await loadUserCollections(userId, userId);

  if (collectionsError) {
    console.error("[loadSpotCollectionSaveState] loadUserCollections failed:", collectionsError);
    return { collections: [] as CollectionWithMeta[], savedCollectionIds: [] as string[], error: collectionsError };
  }

  if (collections.length === 0) {
    return { collections, savedCollectionIds: [] as string[], error: null };
  }

  const collectionIds = collections.map((collection) => collection.id);

  const { data, error } = await supabase
    .from("collection_spots")
    .select("collection_id")
    .eq("post_id", postIdForQuery(postId))
    .in("collection_id", collectionIds);

  if (error) {
    if (isMissingCollectionsTable(error)) {
      console.error("[loadSpotCollectionSaveState] collections tables missing:", error);
      return {
        collections,
        savedCollectionIds: [] as string[],
        error: "Collections are temporarily unavailable. Please try again later.",
      };
    }

    console.error("[loadSpotCollectionSaveState] collection_spots query failed:", error);
    return { collections, savedCollectionIds: [] as string[], error: error.message };
  }

  const savedCollectionIds = (data ?? []).map((row) => String(row.collection_id));

  return { collections, savedCollectionIds, error: null };
}

export async function loadCollectionSpots(collectionId: string): Promise<{
  spots: ProfileContentPost[];
  error: string | null;
}> {
  const { data: links, error: linksError } = await supabase
    .from("collection_spots")
    .select("post_id, sort_order, created_at")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (linksError) {
    return { spots: [], error: linksError.message };
  }

  const postIds = (links ?? []).map((row) => String(row.post_id));

  if (postIds.length === 0) {
    return { spots: [], error: null };
  }

  const { collection: collectionRow } = await loadCollectionById(collectionId);

  const COLLECTION_SPOT_SELECT =
    "id, user_id, content, visibility, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id, visited_count, comments_count, collection_save_count";
  const COLLECTION_SPOT_SELECT_LEGACY =
    "id, user_id, content, visibility, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id";

  let postsQuery = supabase
    .from("posts")
    .select(COLLECTION_SPOT_SELECT)
    .in("id", postIds)
    .eq("content_kind", "spot");

  if (collectionRow?.visibility === "public") {
    postsQuery = postsQuery.eq("visibility", "public");
  }

  let { data: posts, error: postsError } = await postsQuery;

  if (postsError && isMissingSpotRankingColumns(postsError)) {
    let legacyQuery = supabase
      .from("posts")
      .select(COLLECTION_SPOT_SELECT_LEGACY)
      .in("id", postIds)
      .eq("content_kind", "spot");

    if (collectionRow?.visibility === "public") {
      legacyQuery = legacyQuery.eq("visibility", "public");
    }

    const retry = await legacyQuery;
    posts = retry.data as typeof posts;
    postsError = retry.error;
  }

  if (postsError) {
    return { spots: [], error: postsError.message };
  }

  const orderMap = new Map(postIds.map((id, index) => [id, index]));

  const spots = (posts ?? [])
    .map((row) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      content: String(row.content ?? ""),
      visibility: row.visibility as ProfileContentPost["visibility"],
      image_url: (row.image_url as string | null) ?? null,
      video_url: (row.video_url as string | null) ?? null,
      video_cover_url: (row.video_cover_url as string | null) ?? null,
      thumbnail_url: (row.thumbnail_url as string | null) ?? null,
      media_url: (row.media_url as string | null) ?? null,
      media_type: (row.media_type as string | null) ?? null,
      created_at: String(row.created_at),
      content_kind: (row.content_kind as string | null) ?? null,
      spot_name: (row.spot_name as string | null) ?? null,
      spot_latitude: row.spot_latitude != null ? Number(row.spot_latitude) : null,
      spot_longitude: row.spot_longitude != null ? Number(row.spot_longitude) : null,
      spot_address: (row.spot_address as string | null) ?? null,
      spot_city: (row.spot_city as string | null) ?? null,
      spot_country: (row.spot_country as string | null) ?? null,
      ...normalizeSpotPublicStats({
        visited_count: row.visited_count as number | null | undefined,
        comments_count: row.comments_count as number | null | undefined,
        collection_save_count: row.collection_save_count as number | null | undefined,
      }),
    }))
    .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return { spots, error: null };
}

export async function loadCollectionDetail(collectionId: string, viewerId: string | null) {
  const { collection, error } = await loadCollectionById(collectionId);

  if (error || !collection) {
    return { collection: null, owner: null, spots: [], error: error ?? "Collection not found." };
  }

  const allowed = await canViewCollection(collection, viewerId);

  if (!allowed) {
    return { collection: null, owner: null, spots: [], error: "You do not have access to this collection." };
  }

  const [{ data: owner }, spotsResult] = await Promise.all([
    supabase.from("profiles").select("id, username, avatar_url").eq("id", collection.user_id).maybeSingle(),
    loadCollectionSpots(collectionId),
  ]);

  return {
    collection,
    owner: owner
      ? {
          id: String(owner.id),
          username: publicProfileUsername(owner.username),
          avatar_url: (owner.avatar_url as string | null) ?? null,
        }
      : null,
    spots: spotsResult.spots,
    error: spotsResult.error,
  };
}

export function resolveCollectionCoverUrl(collection: CollectionWithMeta, spots: ProfileContentPost[]) {
  if (collection.cover_image_url) {
    return collection.cover_image_url;
  }

  const first = spots[0];

  if (!first) {
    return null;
  }

  const { mediaUrl } = getProfilePostMedia(first);

  return mediaUrl;
}
