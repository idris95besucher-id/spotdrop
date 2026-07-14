import type { ProfileContentPost } from "@/lib/profileContent";
import { publicProfileUsername } from "@/lib/publicProfile";
import { normalizeSpotPublicStats } from "@/lib/spotRanking";
import { supabase } from "@/lib/supabaseClient";

export type ChannelVisibility = "public" | "private";

export type SpotChannel = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  visibility: ChannelVisibility;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelWithMeta = SpotChannel & {
  item_count: number;
};

export const CHANNEL_VISIBILITY_OPTIONS: {
  value: ChannelVisibility;
  label: string;
  description: string;
}[] = [
  { value: "private", label: "Personal", description: "Only you can view this channel." },
  { value: "public", label: "Public", description: "Anyone can view this channel." },
];

function isMissingChannelsTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42P01" || message.includes("channels") || message.includes("add-channels");
}

export function canViewChannel(channel: SpotChannel, viewerId: string | null) {
  if (channel.visibility === "public") {
    return true;
  }

  return Boolean(viewerId && channel.user_id === viewerId);
}

export async function loadChannelById(channelId: string) {
  const { data, error } = await supabase
    .from("channels")
    .select("id, user_id, name, description, visibility, cover_image_url, created_at, updated_at")
    .eq("id", channelId)
    .maybeSingle();

  if (error) {
    if (isMissingChannelsTable(error)) {
      return {
        channel: null,
        error: "Channels are temporarily unavailable. Please try again later.",
      };
    }

    return { channel: null, error: error.message };
  }

  return { channel: (data as SpotChannel | null) ?? null, error: null };
}

export async function loadUserChannels(ownerId: string, viewerId: string | null) {
  const { data, error } = await supabase
    .from("channels")
    .select("id, user_id, name, description, visibility, cover_image_url, created_at, updated_at")
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingChannelsTable(error)) {
      return { channels: [] as ChannelWithMeta[], error: null };
    }

    return { channels: [] as ChannelWithMeta[], error: error.message };
  }

  const rows = ((data ?? []) as SpotChannel[]).filter((channel) => canViewChannel(channel, viewerId));

  const withCounts = await Promise.all(
    rows.map(async (channel) => {
      const { count } = await supabase
        .from("channel_items")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channel.id);

      return {
        ...channel,
        item_count: count ?? 0,
      } satisfies ChannelWithMeta;
    })
  );

  return { channels: withCounts, error: null };
}

export async function createChannel(input: {
  userId: string;
  name: string;
  description?: string;
  visibility?: ChannelVisibility;
  coverImageUrl?: string | null;
}) {
  const name = input.name.trim();

  if (!name) {
    return { channel: null, error: "Channel name is required." };
  }

  const { data, error } = await supabase
    .from("channels")
    .insert({
      user_id: input.userId,
      name,
      description: input.description?.trim() || null,
      visibility: input.visibility ?? "private",
      cover_image_url: input.coverImageUrl ?? null,
    })
    .select("id, user_id, name, description, visibility, cover_image_url, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingChannelsTable(error)) {
      return {
        channel: null,
        error: "Channels are temporarily unavailable. Please try again later.",
      };
    }

    return { channel: null, error: error.message };
  }

  return { channel: data as SpotChannel, error: null };
}

export async function loadChannelItems(channelId: string): Promise<{
  items: ProfileContentPost[];
  error: string | null;
}> {
  const { data: links, error: linksError } = await supabase
    .from("channel_items")
    .select("post_id, sort_order, created_at")
    .eq("channel_id", channelId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (linksError) {
    if (isMissingChannelsTable(linksError)) {
      return { items: [], error: null };
    }

    return { items: [], error: linksError.message };
  }

  const postIds = (links ?? []).map((row) => String(row.post_id)).filter(Boolean);

  if (postIds.length === 0) {
    return { items: [], error: null };
  }

  const select =
    "id, user_id, content, visibility, published_to_spots, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, content_kind, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, visited_count, comments_count, collection_save_count";

  const { data: posts, error: postsError } = await supabase.from("posts").select(select).in("id", postIds);

  if (postsError) {
    return { items: [], error: postsError.message };
  }

  const orderMap = new Map(postIds.map((id, index) => [id, index]));

  const items = (posts ?? [])
    .map((row) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      content: String(row.content ?? ""),
      visibility: row.visibility as ProfileContentPost["visibility"],
      published_to_spots: row.published_to_spots as boolean | null | undefined,
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

  return { items, error: null };
}

export async function loadChannelDetail(channelId: string, viewerId: string | null) {
  const { channel, error } = await loadChannelById(channelId);

  if (error || !channel) {
    return {
      channel: null,
      owner: null,
      items: [] as ProfileContentPost[],
      error: error ?? "Channel not found.",
    };
  }

  if (!canViewChannel(channel, viewerId)) {
    return {
      channel: null,
      owner: null,
      items: [] as ProfileContentPost[],
      error: "You do not have access to this channel.",
    };
  }

  const [{ data: profile }, itemsResult] = await Promise.all([
    supabase.from("profiles").select("id, username, avatar_url").eq("id", channel.user_id).maybeSingle(),
    loadChannelItems(channelId),
  ]);

  return {
    channel,
    owner: profile
      ? {
          id: String(profile.id),
          username: publicProfileUsername(profile.username),
          avatar_url: (profile.avatar_url as string | null) ?? null,
        }
      : null,
    items: itemsResult.items,
    error: itemsResult.error,
  };
}

export async function addPostToChannel(channelId: string, postId: string, userId: string) {
  const { channel, error: channelError } = await loadChannelById(channelId);

  if (channelError || !channel) {
    return { error: channelError ?? "Channel not found." };
  }

  if (channel.user_id !== userId) {
    return { error: "You can only add items to your own channels." };
  }

  const { error } = await supabase.from("channel_items").upsert(
    {
      channel_id: channelId,
      post_id: postId,
      item_kind: "post",
    },
    { onConflict: "channel_id,post_id" }
  );

  if (error) {
    if (isMissingChannelsTable(error)) {
      return { error: "Channels are temporarily unavailable. Please try again later." };
    }

    return { error: error.message };
  }

  await supabase.from("channels").update({ updated_at: new Date().toISOString() }).eq("id", channelId);

  return { error: null };
}
