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

/** Full Postgres/PostgREST error shape for logging — never masked to generic. */
function describeDbError(error: unknown) {
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  return {
    code: e?.code ?? null,
    message: e?.message ?? (error instanceof Error ? error.message : String(error)),
    details: e?.details ?? null,
    hint: e?.hint ?? null,
  };
}

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
  videoCoverUrl: string | null,
  content = ""
): GalleryInsertRow {
  return {
    user_id: userId,
    content,
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
 * Upload a personal photo into Profile Gallery only.
 * Never published as a Spot and never shown on Map/Search/Explore.
 */
export async function createProfileGalleryMedia(
  userId: string,
  file: File,
  options: { caption?: string } = {}
): Promise<{
  post: ProfileContentPost | null;
  error: string | null;
}> {
  const mediaType = getPostMediaType(file);

  if (mediaType !== "image") {
    return { post: null, error: "Only photos are allowed in Profile Gallery." };
  }

  const caption = options.caption?.trim().slice(0, GALLERY_DESCRIPTION_MAX_LENGTH) ?? "";

  let mediaUrl: string;

  try {
    const upload = await uploadPostMedia(userId, file);
    mediaUrl = upload.mediaUrl;
  } catch (caught) {
    console.error("[Gallery upload] storage upload failed", describeDbError(caught));
    return {
      post: null,
      error: caught instanceof Error ? caught.message : "Unable to upload media.",
    };
  }

  const insertRow = buildGalleryInsertRow(userId, mediaUrl, "image", null, caption);

  let { data, error } = await supabase
    .from("posts")
    .insert(insertRow)
    .select(GALLERY_ITEM_SELECT)
    .single();

  if (error) {
    console.error("[Gallery upload] insert failed", describeDbError(error));

    // Older databases may be missing optional columns — retry with the minimal
    // required set so the item still saves.
    if (error.code === "42703" || error.message?.toLowerCase().includes("column")) {
      const retry = await supabase
        .from("posts")
        .insert({
          user_id: userId,
          content: caption,
          visibility: "private",
          content_kind: "post",
          media_url: mediaUrl,
          media_type: "image",
          image_url: mediaUrl,
          video_url: null,
        })
        .select(GALLERY_ITEM_SELECT)
        .single();

      data = retry.data as typeof data;
      error = retry.error;

      if (error) {
        console.error("[Gallery upload] minimal retry insert failed", describeDbError(error));
      }
    }
  }

  // The row can be inserted successfully yet come back empty when the
  // RLS-filtered `RETURNING` yields no row (PostgREST "no rows" → PGRST116).
  // Recover by re-fetching the just-created item so a real success is never
  // reported as a failure and the photo/video appears immediately.
  if ((error?.code === "PGRST116" || !data) && mediaUrl) {
    const { data: recovered, error: recoverError } = await supabase
      .from("posts")
      .select(GALLERY_ITEM_SELECT)
      .eq("user_id", userId)
      .eq("media_url", mediaUrl)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recovered) {
      console.warn("[Gallery upload] recovered inserted row after filtered RETURNING");
      data = recovered as typeof data;
      error = null;
    } else if (recoverError) {
      console.error("[Gallery upload] recovery fetch failed", describeDbError(recoverError));
    }
  }

  if (error || !data) {
    return { post: null, error: error?.message ?? "Unable to save gallery media." };
  }

  return { post: mapGalleryPostRow(data as Record<string, unknown>), error: null };
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
