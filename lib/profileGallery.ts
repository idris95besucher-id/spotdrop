import { getPostMediaType, uploadPostMedia } from "@/lib/postMedia";
import {
  getProfilePostMedia,
  isProfileGalleryItem,
  type ProfileContentPost,
} from "@/lib/profileContent";
import { dispatchProfileMetaRefresh } from "@/lib/profileContentRefresh";
import { deleteOwnedPost } from "@/lib/deleteContent";
import { normalizePostId } from "@/lib/postIds";
import { supabase } from "@/lib/supabaseClient";

export const GALLERY_DESCRIPTION_MAX_LENGTH = 500;

export type ProfileGalleryStats = {
  photos: number;
  videos: number;
};

export function isProfileGalleryVideo(post: ProfileContentPost) {
  const { mediaType } = getProfilePostMedia(post);
  return mediaType === "video" || Boolean(post.video_url?.trim());
}

export function getProfileGalleryStats(posts: ProfileContentPost[]): ProfileGalleryStats {
  let photos = 0;
  let videos = 0;

  for (const post of posts) {
    if (isProfileGalleryVideo(post)) {
      videos += 1;
    } else {
      photos += 1;
    }
  }

  return { photos, videos };
}

type GalleryInsertRow = {
  user_id: string;
  content: string;
  visibility: "private";
  content_kind: "post";
  published_to_spots: false;
  media_url: string;
  media_type: "image" | "video";
  image_url: string | null;
  video_url: string | null;
  video_cover_url: string | null;
  thumbnail_url: string | null;
};

function buildGalleryInsertRow(
  userId: string,
  mediaUrl: string,
  mediaType: "image" | "video",
  videoCoverUrl: string | null
): GalleryInsertRow {
  return {
    user_id: userId,
    content: "",
    visibility: "private",
    content_kind: "post",
    published_to_spots: false,
    media_url: mediaUrl,
    media_type: mediaType,
    image_url: mediaType === "image" ? mediaUrl : videoCoverUrl,
    video_url: mediaType === "video" ? mediaUrl : null,
    video_cover_url: videoCoverUrl,
    thumbnail_url: videoCoverUrl,
  };
}

/**
 * Upload a personal photo/video into Profile Gallery only.
 * Never published as a Spot and never shown on Map/Search/Explore.
 */
export async function createProfileGalleryMedia(userId: string, file: File): Promise<{
  post: ProfileContentPost | null;
  error: string | null;
}> {
  const mediaType = getPostMediaType(file);

  if (!mediaType || mediaType === "video") {
    return {
      post: null,
      error: mediaType === "video" ? "Video is no longer supported." : "Only photos are allowed.",
    };
  }

  try {
    const upload = await uploadPostMedia(userId, file);
    const videoCoverUrl: string | null = null;

    const insertRow = buildGalleryInsertRow(userId, upload.mediaUrl, mediaType, videoCoverUrl);

    let { data, error } = await supabase
      .from("posts")
      .insert(insertRow)
      .select(
        "id, user_id, content, visibility, published_to_spots, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, content_kind"
      )
      .single();

    if (error && (error.code === "42703" || error.message?.toLowerCase().includes("column"))) {
      const retry = await supabase
        .from("posts")
        .insert({
          user_id: userId,
          content: "",
          visibility: "private",
          content_kind: "post",
          media_url: upload.mediaUrl,
          media_type: mediaType,
          image_url: upload.mediaUrl,
          video_url: null,
        })
        .select(
          "id, user_id, content, visibility, image_url, video_url, media_url, media_type, created_at, content_kind"
        )
        .single();

      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error || !data) {
      return { post: null, error: error?.message ?? "Unable to save gallery media." };
    }

    const post: ProfileContentPost = {
      id: String(data.id),
      user_id: String(data.user_id),
      content: String(data.content ?? ""),
      visibility: "private",
      published_to_spots: false,
      image_url: (data.image_url as string | null) ?? null,
      video_url: (data.video_url as string | null) ?? null,
      video_cover_url: (data.video_cover_url as string | null) ?? videoCoverUrl,
      thumbnail_url: (data.thumbnail_url as string | null) ?? videoCoverUrl,
      media_url: (data.media_url as string | null) ?? upload.mediaUrl,
      media_type: (data.media_type as string | null) ?? mediaType,
      created_at: String(data.created_at),
      content_kind: "post",
    };

    return { post, error: null };
  } catch (caught) {
    return {
      post: null,
      error: caught instanceof Error ? caught.message : "Unable to save gallery media.",
    };
  }
}

function mapGalleryPostRow(data: Record<string, unknown>): ProfileContentPost {
  return {
    id: String(data.id),
    user_id: String(data.user_id),
    content: String(data.content ?? ""),
    visibility: (data.visibility as ProfileContentPost["visibility"]) ?? "private",
    published_to_spots: (data.published_to_spots as boolean | null) ?? false,
    image_url: (data.image_url as string | null) ?? null,
    video_url: (data.video_url as string | null) ?? null,
    video_cover_url: (data.video_cover_url as string | null) ?? null,
    thumbnail_url: (data.thumbnail_url as string | null) ?? null,
    media_url: (data.media_url as string | null) ?? null,
    media_type: (data.media_type as string | null) ?? null,
    created_at: String(data.created_at),
    content_kind: (data.content_kind as string | null) ?? "post",
  };
}

const GALLERY_ITEM_SELECT =
  "id, user_id, content, visibility, published_to_spots, image_url, video_url, video_cover_url, thumbnail_url, media_url, media_type, created_at, content_kind";

async function loadOwnedGalleryItem(userId: string, postId: string) {
  const normalizedId = normalizePostId(postId);

  if (!normalizedId) {
    return { post: null, error: "Invalid gallery item." };
  }

  const { data, error } = await supabase
    .from("posts")
    .select(GALLERY_ITEM_SELECT)
    .eq("id", normalizedId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { post: null, error: error?.message ?? "Gallery item not found." };
  }

  const post = mapGalleryPostRow(data as Record<string, unknown>);

  if (!isProfileGalleryItem(post)) {
    return { post: null, error: "This item is not part of your Profile Gallery." };
  }

  return { post, error: null };
}

export function isProfileGalleryPhoto(post: ProfileContentPost) {
  return isProfileGalleryItem(post) && !isProfileGalleryVideo(post);
}

export function getProfileGalleryDescription(post: ProfileContentPost) {
  return post.content?.trim() ?? "";
}

export async function updateProfileGalleryDescription(
  userId: string,
  postId: string,
  description: string
): Promise<{ post: ProfileContentPost | null; error: string | null }> {
  const { post, error } = await loadOwnedGalleryItem(userId, postId);

  if (!post) {
    return { post: null, error };
  }

  const content = description.trim().slice(0, GALLERY_DESCRIPTION_MAX_LENGTH);

  const { data, error: updateError } = await supabase
    .from("posts")
    .update({ content })
    .eq("id", post.id)
    .eq("user_id", userId)
    .select(GALLERY_ITEM_SELECT)
    .single();

  if (updateError || !data) {
    return { post: null, error: updateError?.message ?? "Unable to save description." };
  }

  return { post: mapGalleryPostRow(data as Record<string, unknown>), error: null };
}

export async function deleteProfileGalleryItem(
  userId: string,
  postId: string
): Promise<{ ok: boolean; error: string | null }> {
  const { post, error } = await loadOwnedGalleryItem(userId, postId);

  if (!post) {
    return { ok: false, error };
  }

  const result = await deleteOwnedPost(postId, userId);
  return { ok: result.ok, error: result.error ?? null };
}

export async function setProfilePhotoFromGalleryItem(
  userId: string,
  postId: string
): Promise<{ ok: boolean; avatarUrl: string | null; error: string | null }> {
  const { post, error } = await loadOwnedGalleryItem(userId, postId);

  if (!post) {
    return { ok: false, avatarUrl: null, error };
  }

  if (!isProfileGalleryPhoto(post)) {
    return { ok: false, avatarUrl: null, error: "Only photos can be set as profile pictures." };
  }

  const { mediaUrl, mediaType } = getProfilePostMedia(post);
  const avatarUrl =
    mediaType === "image"
      ? mediaUrl ?? post.image_url ?? post.media_url
      : post.image_url ?? post.media_url;

  if (!avatarUrl?.trim()) {
    return { ok: false, avatarUrl: null, error: "Photo unavailable." };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);

  if (updateError) {
    return { ok: false, avatarUrl: null, error: updateError.message };
  }

  dispatchProfileMetaRefresh();
  return { ok: true, avatarUrl, error: null };
}
