import { isDiscoveryRelationMissing } from "@/lib/discoveryMap";
import { supabase } from "@/lib/supabaseClient";

export type StoryVisibility = "public" | "friends" | "private";
export type StoryMediaType = "image" | "video";

export type StoryRow = {
  id: string;
  user_id: string;
  city_id: string | null;
  place_id: string | null;
  media_url: string;
  media_type: StoryMediaType;
  caption: string;
  visibility: StoryVisibility;
  shared_to_room: boolean;
  expires_at: string;
  archived_at: string | null;
  created_at: string;
  profiles?: { username: string; avatar_url: string | null } | null;
};

export type PlaceFeedItem = {
  id: string;
  kind: "post" | "story";
  user_id: string;
  content: string;
  media_url: string | null;
  media_type: StoryMediaType | null;
  created_at: string;
  is_archived_story: boolean;
  profiles: { username: string; avatar_url: string | null; is_ai_guide?: boolean; is_official?: boolean } | null;
  post_id?: string;
  story_id?: string;
};

const POST_STORY_SELECT =
  "id, user_id, content, visibility, content_kind, media_url, media_type, image_url, video_url, discovery_place_id, expires_at, created_at, profiles(username, avatar_url)";

function normalizeProfileJoin<T extends { username: string; avatar_url: string | null }>(
  value: T | T[] | null | undefined
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getPostMedia(record: Record<string, unknown>) {
  const mediaUrl =
    (record.media_url as string | null) ??
    (record.video_url as string | null) ??
    (record.image_url as string | null) ??
    "";

  const mediaType =
    record.media_type === "video" || record.video_url
      ? ("video" as const)
      : record.media_type === "image" || record.image_url
        ? ("image" as const)
        : ("image" as const);

  return { mediaUrl, mediaType };
}

function mapStoryRow(row: Record<string, unknown>): StoryRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    city_id: (row.city_id as string | null) ?? null,
    place_id: (row.place_id as string | null) ?? null,
    media_url: String(row.media_url),
    media_type: row.media_type as StoryMediaType,
    caption: String(row.caption ?? ""),
    visibility: row.visibility as StoryVisibility,
    shared_to_room: Boolean(row.shared_to_room),
    expires_at: String(row.expires_at),
    archived_at: (row.archived_at as string | null) ?? null,
    created_at: String(row.created_at),
    profiles: normalizeProfileJoin(row.profiles as { username: string; avatar_url: string | null } | null),
  };
}

function mapPostToStoryRow(row: Record<string, unknown>, nowIso: string): StoryRow {
  const { mediaUrl, mediaType } = getPostMedia(row);
  const expiresAt = String(row.expires_at ?? "");
  const placeId = (row.discovery_place_id as string | null) ?? null;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    city_id: null,
    place_id: placeId,
    media_url: mediaUrl,
    media_type: mediaType,
    caption: String(row.content ?? ""),
    visibility: (row.visibility as StoryVisibility) ?? "public",
    shared_to_room: Boolean(placeId),
    expires_at: expiresAt,
    archived_at: expiresAt && expiresAt <= nowIso ? expiresAt : null,
    created_at: String(row.created_at),
    profiles: normalizeProfileJoin(row.profiles as { username: string; avatar_url: string | null } | null),
  };
}

export function isStoriesRelationMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST200" ||
    message.includes("stories")
  );
}

function isPostStoryColumnsMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" || message.includes("content_kind") || message.includes("expires_at");
}

async function loadStoriesFromPostsTable(userId: string, mode: "active" | "archived") {
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("posts")
    .select(POST_STORY_SELECT)
    .eq("user_id", userId)
    .in("content_kind", ["story", "video"]);

  if (mode === "active") {
    query = query.gt("expires_at", nowIso);
  } else {
    query = query.lte("expires_at", nowIso);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(60);

  if (error) {
    if (isPostStoryColumnsMissing(error) || isStoriesRelationMissing(error)) {
      return { stories: [] as StoryRow[], error: null };
    }

    return { stories: [] as StoryRow[], error: error.message };
  }

  return {
    stories: (data ?? []).map((row) => mapPostToStoryRow(row as Record<string, unknown>, nowIso)),
    error: null,
  };
}

export async function archiveExpiredStoriesForUser(userId: string) {
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("stories")
    .update({ archived_at: nowIso })
    .eq("user_id", userId)
    .is("archived_at", null)
    .lte("expires_at", nowIso);

  if (error && !isStoriesRelationMissing(error)) {
    console.error("archiveExpiredStoriesForUser:", error.message);
  }
}

export async function loadActiveProfileStories(userId: string) {
  const nowIso = new Date().toISOString();

  await archiveExpiredStoriesForUser(userId);

  const { data, error } = await supabase
    .from("stories")
    .select("id, user_id, city_id, place_id, media_url, media_type, caption, visibility, shared_to_room, expires_at, archived_at, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (!error) {
    return { stories: (data ?? []).map((row) => mapStoryRow(row as Record<string, unknown>)), error: null };
  }

  if (isStoriesRelationMissing(error)) {
    return loadStoriesFromPostsTable(userId, "active");
  }

  return { stories: [] as StoryRow[], error: error.message };
}

export async function loadArchivedProfileStories(userId: string) {
  await archiveExpiredStoriesForUser(userId);

  const { data, error } = await supabase
    .from("stories")
    .select("id, user_id, city_id, place_id, media_url, media_type, caption, visibility, shared_to_room, expires_at, archived_at, created_at")
    .eq("user_id", userId)
    .not("archived_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);

  if (!error) {
    return { stories: (data ?? []).map((row) => mapStoryRow(row as Record<string, unknown>)), error: null };
  }

  if (isStoriesRelationMissing(error)) {
    return loadStoriesFromPostsTable(userId, "archived");
  }

  return { stories: [] as StoryRow[], error: error.message };
}

export type CreateStoryInput = {
  userId: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  caption: string;
  visibility: StoryVisibility;
  sharedToRoom: boolean;
  cityId: string | null;
  placeId: string | null;
};

async function createStoryAsPost(input: CreateStoryInput) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const contentKind = input.mediaType === "video" ? "video" : "story";

  const row = {
    user_id: input.userId,
    content: input.caption.trim() || "Story",
    visibility: input.visibility,
    content_kind: contentKind,
    discovery_place_id: input.sharedToRoom ? input.placeId : null,
    media_url: input.mediaUrl,
    media_type: input.mediaType,
    image_url: input.mediaType === "image" ? input.mediaUrl : null,
    video_url: input.mediaType === "video" ? input.mediaUrl : null,
    expires_at: expiresAt,
  };

  const { data, error } = await supabase.from("posts").insert(row).select(POST_STORY_SELECT).single();

  if (error) {
    return { story: null, error: error.message };
  }

  return {
    story: mapPostToStoryRow(data as Record<string, unknown>, new Date().toISOString()),
    error: null,
  };
}

export async function createStory(input: CreateStoryInput) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("stories")
    .insert({
      user_id: input.userId,
      city_id: input.sharedToRoom ? input.cityId : null,
      place_id: input.sharedToRoom ? input.placeId : null,
      media_url: input.mediaUrl,
      media_type: input.mediaType,
      caption: input.caption.trim(),
      visibility: input.visibility,
      shared_to_room: input.sharedToRoom,
      expires_at: expiresAt,
      archived_at: null,
    })
    .select(
      "id, user_id, city_id, place_id, media_url, media_type, caption, visibility, shared_to_room, expires_at, archived_at, created_at"
    )
    .single();

  if (error) {
    if (isStoriesRelationMissing(error)) {
      return createStoryAsPost(input);
    }

    return { story: null, error: error.message };
  }

  return { story: mapStoryRow(data as Record<string, unknown>), error: null };
}

export async function loadPlaceFeed(placeId: string) {
  if (placeId.startsWith("fallback-")) {
    return { items: [] as PlaceFeedItem[], stories: [] as StoryRow[], error: null };
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, user_id, content, content_kind, media_url, media_type, image_url, video_url, created_at, expires_at, profiles(username, avatar_url, is_ai_guide, is_official)"
    )
    .eq("discovery_place_id", placeId)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    if (isDiscoveryRelationMissing(error) || isPostStoryColumnsMissing(error)) {
      return { items: [] as PlaceFeedItem[], stories: [] as StoryRow[], error: null };
    }

    return { items: [] as PlaceFeedItem[], stories: [] as StoryRow[], error: error.message };
  }

  const items: PlaceFeedItem[] = [];
  const activeStories: StoryRow[] = [];

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const profile = normalizeProfileJoin(
      record.profiles as { username: string; avatar_url: string | null; is_ai_guide?: boolean; is_official?: boolean } | null
    );
    const { mediaUrl, mediaType } = getPostMedia(record);
    const contentKind = String(record.content_kind ?? "post");
    const expiresAt = record.expires_at ? String(record.expires_at) : null;
    const isStory = contentKind === "story" || contentKind === "video";
    const isArchived = isStory && expiresAt !== null && expiresAt <= nowIso;

    if (isStory && expiresAt && expiresAt > nowIso) {
      activeStories.push(mapPostToStoryRow(record, nowIso));
    }

    items.push({
      id: isStory ? `story-${record.id}` : `post-${record.id}`,
      kind: isStory ? "story" : "post",
      user_id: String(record.user_id),
      content: String(record.content ?? ""),
      media_url: mediaUrl || null,
      media_type: mediaType,
      created_at: String(record.created_at),
      is_archived_story: isArchived,
      profiles: profile
        ? {
            username: profile.username,
            avatar_url: profile.avatar_url,
            is_ai_guide: Boolean(profile.is_ai_guide),
            is_official: Boolean(profile.is_official),
          }
        : null,
      post_id: String(record.id),
    });
  }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { items, stories: activeStories, error: null };
}
