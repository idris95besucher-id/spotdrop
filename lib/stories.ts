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

function normalizeProfileJoin<T extends { username: string; avatar_url: string | null }>(
  value: T | T[] | null | undefined
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
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

export async function archiveExpiredStoriesForUser(userId: string) {
  const nowIso = new Date().toISOString();

  await supabase
    .from("stories")
    .update({ archived_at: nowIso })
    .eq("user_id", userId)
    .is("archived_at", null)
    .lte("expires_at", nowIso);
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

  if (error) {
    if (isStoriesRelationMissing(error)) {
      return { stories: [] as StoryRow[], error: null };
    }

    return { stories: [] as StoryRow[], error: error.message };
  }

  return { stories: (data ?? []).map((row) => mapStoryRow(row as Record<string, unknown>)), error: null };
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

  if (error) {
    if (isStoriesRelationMissing(error)) {
      return { stories: [] as StoryRow[], error: null };
    }

    return { stories: [] as StoryRow[], error: error.message };
  }

  return { stories: (data ?? []).map((row) => mapStoryRow(row as Record<string, unknown>)), error: null };
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
      return { story: null, error: "Run database/add-stories.sql in Supabase to enable stories." };
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

  const [postsResult, storiesResult] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, user_id, content, media_url, media_type, image_url, video_url, created_at, profiles(username, avatar_url, is_ai_guide, is_official)"
      )
      .eq("discovery_place_id", placeId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("stories")
      .select(
        "id, user_id, city_id, place_id, media_url, media_type, caption, visibility, shared_to_room, expires_at, archived_at, created_at, profiles(username, avatar_url)"
      )
      .eq("place_id", placeId)
      .eq("shared_to_room", true)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const errors = [postsResult.error, storiesResult.error].filter(Boolean);
  const blockingError = errors.find((e) => e && !isStoriesRelationMissing(e) && !isDiscoveryRelationMissing(e));

  if (blockingError) {
    return { items: [] as PlaceFeedItem[], stories: [] as StoryRow[], error: blockingError.message };
  }

  const postItems: PlaceFeedItem[] = (postsResult.data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const profile = normalizeProfileJoin(
      record.profiles as { username: string; avatar_url: string | null; is_ai_guide?: boolean; is_official?: boolean } | null
    );
    const mediaUrl =
      (record.media_url as string | null) ??
      (record.video_url as string | null) ??
      (record.image_url as string | null) ??
      null;
    const mediaType = (record.media_type as string | null) ?? (record.video_url ? "video" : record.image_url ? "image" : null);

    return {
      id: `post-${record.id}`,
      kind: "post" as const,
      user_id: String(record.user_id),
      content: String(record.content ?? ""),
      media_url: mediaUrl,
      media_type: mediaType as StoryMediaType | null,
      created_at: String(record.created_at),
      is_archived_story: false,
      profiles: profile
        ? {
            username: profile.username,
            avatar_url: profile.avatar_url,
            is_ai_guide: Boolean(profile.is_ai_guide),
            is_official: Boolean(profile.is_official),
          }
        : null,
      post_id: String(record.id),
    };
  });

  const storyRows = (storiesResult.data ?? []).map((row) => mapStoryRow(row as Record<string, unknown>));

  const storyItems: PlaceFeedItem[] = storyRows.map((story) => ({
    id: `story-${story.id}`,
    kind: "story" as const,
    user_id: story.user_id,
    content: story.caption,
    media_url: story.media_url,
    media_type: story.media_type,
    created_at: story.created_at,
    is_archived_story: Boolean(story.archived_at) || story.expires_at <= nowIso,
    profiles: story.profiles
      ? { username: story.profiles.username, avatar_url: story.profiles.avatar_url }
      : null,
    story_id: story.id,
  }));

  const activePlaceStories = storyRows.filter((s) => !s.archived_at && s.expires_at > nowIso);

  const items = [...postItems, ...storyItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { items, stories: activePlaceStories, error: null };
}
