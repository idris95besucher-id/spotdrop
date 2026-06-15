import { normalizePostId, postIdForQuery } from "@/lib/postIds";
import { dispatchSpotDeleted } from "@/lib/spotDeletedEvents";
import { POST_MEDIA_BUCKET, requireAuthenticatedUser } from "@/lib/storageUpload";
import { isStoriesRelationMissing } from "@/lib/stories";
import { supabase } from "@/lib/supabaseClient";

const MEDIA_URL_FIELDS = [
  "media_url",
  "image_url",
  "video_url",
  "video_cover_url",
  "thumbnail_url",
] as const;

const STORY_CONTENT_KINDS = new Set(["story", "video"]);

export function storagePathFromPublicUrl(
  publicUrl: string | null | undefined,
  bucket = POST_MEDIA_BUCKET
): string | null {
  if (!publicUrl?.trim()) {
    return null;
  }

  const marker = `/storage/v1/object/public/${bucket}/`;
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const rawPath = publicUrl.slice(markerIndex + marker.length).split("?")[0];
  return decodeURIComponent(rawPath);
}

export function collectMediaUrls(record: Record<string, unknown>) {
  const urls = new Set<string>();

  for (const field of MEDIA_URL_FIELDS) {
    const value = record[field];

    if (typeof value === "string" && value.trim()) {
      urls.add(value.trim());
    }
  }

  return [...urls];
}

export async function removeStorageObjectsForUrls(urls: string[]) {
  const paths = [...new Set(urls.map((url) => storagePathFromPublicUrl(url)).filter(Boolean))] as string[];

  if (paths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(POST_MEDIA_BUCKET).remove(paths);

  if (error) {
    console.warn("removeStorageObjectsForUrls:", error.message);
  }
}

async function fetchOwnedPostRow(postId: string, userId: string) {
  const queryId = postIdForQuery(postId);

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id, user_id, media_url, image_url, video_url, video_cover_url, thumbnail_url, content_kind"
    )
    .eq("id", queryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }

  if (!data) {
    return { row: null, error: "Post not found or you cannot delete it." };
  }

  return { row: data as Record<string, unknown>, error: null };
}

function formatSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" — ");
}

function mapDeleteRpcError(code: string | undefined) {
  switch (code) {
    case "not_authenticated":
      return "Sign in required.";
    case "not_owner":
      return "You can only delete your own Spots.";
    case "post_not_found":
      return "Spot not found or already deleted.";
    case "delete_blocked":
      return "Delete was blocked. Check your permissions and try again.";
    case "invalid_post_id":
      return "Invalid Spot id.";
    default:
      return code ?? "Unable to delete.";
  }
}

function isDeleteRpcMissing(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    message.includes("delete_owned_post") ||
    (message.includes("function") && message.includes("schema cache"))
  );
}

async function deleteOwnedPostViaRpc(postId: string, userId: string) {
  const { data, error } = await supabase.rpc("delete_owned_post", {
    p_post_id: String(postIdForQuery(postId)),
  });

  if (error) {
    if (isDeleteRpcMissing(error)) {
      return { ok: false as const, error: null, mediaUrls: [] as string[], useFallback: true };
    }

    return {
      ok: false as const,
      error: error.message || "Unable to delete Spot.",
      mediaUrls: [] as string[],
      useFallback: false,
    };
  }

  const payload = data as
    | {
        ok?: boolean;
        error?: string;
        media_url?: string | null;
        image_url?: string | null;
        video_url?: string | null;
        video_cover_url?: string | null;
        thumbnail_url?: string | null;
      }
    | null;

  if (!payload?.ok) {
    return {
      ok: false as const,
      error: mapDeleteRpcError(payload?.error),
      mediaUrls: [] as string[],
      useFallback: false,
    };
  }

  return {
    ok: true as const,
    error: null,
    mediaUrls: collectMediaUrls(payload as Record<string, unknown>),
    useFallback: false,
  };
}

async function deleteOwnedPostDirect(postId: string, userId: string, mediaUrls: string[]) {
  const queryId = postIdForQuery(postId);

  const { error: deleteError, count } = await supabase
    .from("posts")
    .delete({ count: "exact" })
    .eq("id", queryId)
    .eq("user_id", userId);

  if (deleteError) {
    return {
      ok: false as const,
      error: formatSupabaseError(deleteError) || deleteError.message,
    };
  }

  if (!count) {
    return {
      ok: false as const,
      error: "Delete failed. You may not have permission to delete this Spot.",
    };
  }

  await removeStorageObjectsForUrls(mediaUrls);

  return { ok: true as const, error: null };
}

/** Delete a post, spot, or story stored in the posts table (not dedicated stories table). */
export async function deleteOwnedPost(postId: string, userId: string) {
  try {
    await requireAuthenticatedUser(userId);
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Sign in required." };
  }

  const { row, error: fetchError } = await fetchOwnedPostRow(postId, userId);

  if (row) {
    const contentKind = String(row.content_kind ?? "");

    if (contentKind === "story") {
      return deleteOwnedStory(postId, userId);
    }
  }

  const fallbackMediaUrls = row ? collectMediaUrls(row) : [];

  const rpcResult = await deleteOwnedPostViaRpc(postId, userId);

  if (rpcResult.ok) {
    await removeStorageObjectsForUrls(
      rpcResult.mediaUrls.length > 0 ? rpcResult.mediaUrls : fallbackMediaUrls
    );
    return { ok: true, error: null };
  }

  if (rpcResult.error && !rpcResult.useFallback) {
    return { ok: false, error: rpcResult.error };
  }

  const directResult = await deleteOwnedPostDirect(postId, userId, fallbackMediaUrls);

  if (!directResult.ok && !row) {
    return { ok: false, error: directResult.error ?? fetchError ?? "Unable to delete." };
  }

  return directResult;
}

/** Delete a spot owned by the user and refresh dependent UI surfaces. */
export async function deleteOwnedSpot(postId: string, userId: string) {
  console.info(`DELETE_SPOT_CLICKED postId=${normalizePostId(postId) ?? postId}`);

  try {
    await requireAuthenticatedUser(userId);
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Sign in required." };
  }

  const { row, error: fetchError } = await fetchOwnedPostRow(postId, userId);

  if (row && String(row.content_kind ?? "") !== "spot") {
    return { ok: false, error: "This post is not a Spot." };
  }

  const rpcResult = await deleteOwnedPostViaRpc(postId, userId);
  const fallbackMediaUrls = row ? collectMediaUrls(row) : [];

  if (rpcResult.ok) {
    await removeStorageObjectsForUrls(
      rpcResult.mediaUrls.length > 0 ? rpcResult.mediaUrls : fallbackMediaUrls
    );
    dispatchSpotDeleted(postId);
    return { ok: true, error: null };
  }

  if (rpcResult.error && !rpcResult.useFallback) {
    return { ok: false, error: rpcResult.error };
  }

  const directResult = await deleteOwnedPostDirect(postId, userId, fallbackMediaUrls);

  if (!directResult.ok) {
    return { ok: false, error: directResult.error ?? fetchError ?? "Unable to delete." };
  }

  dispatchSpotDeleted(postId);
  return { ok: true, error: null };
}

/** Delete a story from the stories table and/or posts fallback. */
export async function deleteOwnedStory(storyId: string, userId: string) {
  try {
    await requireAuthenticatedUser(userId);
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Sign in required." };
  }

  const mediaUrls: string[] = [];
  const queryId = postIdForQuery(storyId);

  const { data: storyRow, error: storyFetchError } = await supabase
    .from("stories")
    .select("id, user_id, media_url")
    .eq("id", queryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!storyFetchError && storyRow) {
    if (typeof storyRow.media_url === "string") {
      mediaUrls.push(storyRow.media_url);
    }

    const { error: storyDeleteError } = await supabase
      .from("stories")
      .delete()
      .eq("id", queryId)
      .eq("user_id", userId);

    if (storyDeleteError && !isStoriesRelationMissing(storyDeleteError)) {
      return { ok: false, error: storyDeleteError.message };
    }
  } else if (storyFetchError && !isStoriesRelationMissing(storyFetchError)) {
    return { ok: false, error: storyFetchError.message };
  }

  const { row: postRow, error: postFetchError } = await fetchOwnedPostRow(storyId, userId);

  if (postRow) {
    const contentKind = String(postRow.content_kind ?? "");

    if (!STORY_CONTENT_KINDS.has(contentKind)) {
      return { ok: false, error: "This item cannot be deleted as a story." };
    }

    mediaUrls.push(...collectMediaUrls(postRow));

    const { data, error: postDeleteError, count } = await supabase
      .from("posts")
      .delete({ count: "exact" })
      .eq("id", queryId)
      .eq("user_id", userId);

    if (postDeleteError) {
      return { ok: false, error: formatSupabaseError(postDeleteError) || postDeleteError.message };
    }

    if (!count) {
      return { ok: false, error: "Delete failed. You may not have permission to delete this story." };
    }
  } else if (postFetchError) {
    return { ok: false, error: postFetchError };
  } else if (!storyRow) {
    return { ok: false, error: "Story not found or you cannot delete it." };
  }

  await removeStorageObjectsForUrls(mediaUrls);

  return { ok: true, error: null };
}
