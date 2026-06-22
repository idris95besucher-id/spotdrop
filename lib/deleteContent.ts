import { normalizePostId, postIdForQuery } from "@/lib/postIds";
import { dispatchSpotDeleted } from "@/lib/spotDeletedEvents";
import { POST_MEDIA_BUCKET } from "@/lib/storageUpload";
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

const RELATED_DELETE_TABLES = [
  "post_comments",
  "post_reactions",
  "collection_spots",
  "spot_collection_saves",
  "spot_visits",
  "spot_visited_daily",
  "spot_commenters",
  "guide_places",
] as const;

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
};

type SpotRow = {
  id: string;
  user_id: string;
  media_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  video_cover_url?: string | null;
  thumbnail_url?: string | null;
  content_kind?: string | null;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
};

const DELETE_SPOT_TIMEOUT_MS = 10_000;

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

function formatSupabaseError(error: SupabaseErrorLike) {
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" — ");
}

function postIdForDelete(postId: string): string | null {
  return normalizePostId(postId);
}

/** PostgREST id variants — uuid string and/or bigint number. */
function postIdQueryVariants(spotId: string): Array<string | number> {
  const variants: Array<string | number> = [spotId];

  if (/^\d+$/.test(spotId)) {
    const asNumber = postIdForQuery(spotId);

    if (typeof asNumber === "number" && !variants.includes(asNumber)) {
      variants.push(asNumber);
    }
  }

  return variants;
}

function withDeleteTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} timed out after ${DELETE_SPOT_TIMEOUT_MS / 1000}s`)),
        DELETE_SPOT_TIMEOUT_MS
      );
    }),
  ]);
}

async function getAuthenticatedUserId(): Promise<{ userId: string | null; error: string | null }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  let user = sessionData.session?.user ?? null;

  if (!user) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    user = userData.user ?? null;

    if (userError || !user) {
      console.error("DELETE SPOT AUTH ERROR:", userError ?? sessionError ?? "no session");
      return {
        userId: null,
        error: userError?.message ?? sessionError?.message ?? "Sign in required.",
      };
    }
  }

  console.log("Current user:", user.id);
  return { userId: user.id, error: null };
}

async function fetchSpotRow(spotId: string): Promise<{ row: SpotRow | null; error: string | null }> {
  for (const idVariant of postIdQueryVariants(spotId)) {
    const { data, error } = await supabase
      .from("posts")
      .select(
        "id, user_id, media_url, image_url, video_url, video_cover_url, thumbnail_url, content_kind, spot_latitude, spot_longitude"
      )
      .eq("id", idVariant)
      .maybeSingle();

    if (error) {
      console.error("FETCH SPOT ERROR:", error);
      return { row: null, error: formatSupabaseError(error) || error.message };
    }

    if (data) {
      const row: SpotRow = {
        ...data,
        id: normalizePostId(data.id) ?? spotId,
        user_id: String(data.user_id),
      };

      console.log("Fetched spot:", { postId: row.id, postUserId: row.user_id });
      return { row, error: null };
    }
  }

  return { row: null, error: "Spot not found." };
}

async function deleteRelatedSpotRows(spotId: string): Promise<void> {
  const idVariants = postIdQueryVariants(spotId);

  for (const table of RELATED_DELETE_TABLES) {
    for (const idVariant of idVariants) {
      const { error } = await supabase.from(table).delete().eq("post_id", idVariant);

      if (error) {
        const message = error.message?.toLowerCase() ?? "";

        if (
          error.code === "42P01" ||
          error.code === "PGRST205" ||
          message.includes("does not exist") ||
          message.includes("could not find the table")
        ) {
          break;
        }

        console.error(`DELETE RELATED ${table} ERROR:`, error);
      } else {
        break;
      }
    }
  }

  for (const idVariant of idVariants) {
    const { error } = await supabase
      .from("direct_messages")
      .delete()
      .eq("message_type", "spot")
      .eq("post_id", idVariant);

    if (!error) {
      break;
    }

    console.error("DELETE RELATED direct_messages ERROR:", error);
  }
}

async function deletePostRowDirect(
  spotId: string,
  authUserId: string
): Promise<{ ok: true; deletedId: string } | { ok: false; error: string }> {
  console.log("DELETE SPOT — exact query:");
  console.log(`  supabase.from("posts").delete().eq("id", "${spotId}").eq("user_id", "${authUserId}")`);

  await deleteRelatedSpotRows(spotId);

  for (const idVariant of postIdQueryVariants(spotId)) {
    const { data: deletedRows, error } = await supabase
      .from("posts")
      .delete()
      .eq("id", idVariant)
      .eq("user_id", authUserId)
      .select("id");

    if (error) {
      const result = { ok: false as const, error: formatSupabaseError(error) || error.message };
      console.log("DIRECT DELETE RESULT", result);
      return result;
    }

    if (deletedRows?.length) {
      const deletedId = normalizePostId(deletedRows[0]?.id) ?? spotId;
      const result = { ok: true as const, deletedId };
      console.log("DIRECT DELETE RESULT", result);
      return result;
    }
  }

  const message =
    'Delete failed — 0 rows deleted. Run database/ensure-spot-delete.sql in Supabase (policy: "Users can delete own posts" USING (user_id = auth.uid())).';
  const result = { ok: false as const, error: message };
  console.log("DIRECT DELETE RESULT", result);
  return result;
}

async function deletePostViaRpc(
  spotId: string,
  authUserId: string
): Promise<{ ok: true; mediaUrls: string[] } | { ok: false; error: string }> {
  console.log('DELETE SPOT RPC: supabase.rpc("delete_owned_post", { p_post_id:', spotId, "})");

  const { data, error } = await supabase.rpc("delete_owned_post", {
    p_post_id: spotId,
  });

  if (error) {
    const result = { ok: false as const, error: formatSupabaseError(error) || error.message };
    console.log("RPC RESULT", result);
    return result;
  }

  const payload = data as {
    ok?: boolean;
    error?: string;
    media_url?: string | null;
    image_url?: string | null;
    video_url?: string | null;
    video_cover_url?: string | null;
    thumbnail_url?: string | null;
  } | null;

  if (!payload?.ok) {
    const rpcError = payload?.error ?? "delete_failed";

    if (rpcError === "not_authenticated") {
      const result = { ok: false as const, error: "Sign in required." };
      console.log("RPC RESULT", result);
      return result;
    }

    if (rpcError === "not_owner") {
      const result = { ok: false as const, error: "You can only delete your own Spots." };
      console.log("RPC RESULT", result);
      return result;
    }

    const result = { ok: false as const, error: rpcError };
    console.log("RPC RESULT", result);
    return result;
  }

  for (const idVariant of postIdQueryVariants(spotId)) {
    const { data: stillThere } = await supabase.from("posts").select("id").eq("id", idVariant).maybeSingle();

    if (stillThere) {
      const result = {
        ok: false as const,
        error: "RPC reported success but spot still exists in posts.",
      };
      console.log("RPC RESULT", result);
      return result;
    }
  }

  const result = {
    ok: true as const,
    mediaUrls: collectMediaUrls(payload as Record<string, unknown>),
  };
  console.log("RPC RESULT", result);
  return result;
}

async function removeSpotMediaBestEffort(mediaUrls: string[], spotId: string) {
  if (mediaUrls.length === 0) {
    return;
  }

  const paths = [...new Set(mediaUrls.map((url) => storagePathFromPublicUrl(url)).filter(Boolean))] as string[];

  if (paths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(POST_MEDIA_BUCKET).remove(paths);

  if (error) {
    console.warn("DELETE STORAGE ERROR (non-fatal):", error);
    return;
  }

  console.log("DELETE STORAGE OK:", { spotId, paths });
}

export async function removeStorageObjectsForUrls(urls: string[]) {
  const paths = [...new Set(urls.map((url) => storagePathFromPublicUrl(url)).filter(Boolean))] as string[];

  if (paths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(POST_MEDIA_BUCKET).remove(paths);

  if (error) {
    console.warn("removeStorageObjectsForUrls:", formatSupabaseError(error));
  }
}

/** Delete a spot (row in public.posts). Returns { ok, error } — never throws. */
export async function deleteOwnedSpot(postId: string, _userId?: string) {
  console.log("DELETE FUNCTION START", { postId });

  try {
    const result = await withDeleteTimeout(deleteOwnedSpotInternal(postId), "Delete spot");

    if (result.ok) {
      console.log("DELETE SUCCESS");
    } else {
      console.log("DELETE FAILED", result.error);
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log("DELETE FAILED", error);
    return {
      ok: false as const,
      error,
    };
  }
}

async function deleteOwnedSpotInternal(postId: string) {
  const spotId = postIdForDelete(String(postId));

  if (!spotId) {
    return { ok: false as const, error: "Invalid Spot id." };
  }

  const { userId: authUserId, error: authError } = await getAuthenticatedUserId();

  if (!authUserId) {
    return { ok: false as const, error: authError ?? "Sign in required." };
  }

  const { row, error: fetchError } = await fetchSpotRow(spotId);

  if (!row) {
    return { ok: false as const, error: fetchError ?? "Spot not found." };
  }

  console.log("Deleting post:", row.id);
  console.log("Current user:", authUserId);
  console.log("Post owner:", row.user_id);

  if (row.user_id !== authUserId) {
    return { ok: false as const, error: "You can only delete your own Spots." };
  }

  if (row.content_kind === "story") {
    return { ok: false as const, error: "This item is a story, not a Spot." };
  }

  const mediaUrls = collectMediaUrls(row as Record<string, unknown>);

  // 1) RPC first — bypasses RLS when deployed
  const rpcResult = await deletePostViaRpc(row.id, authUserId);

  if (rpcResult.ok) {
    await removeSpotMediaBestEffort(
      rpcResult.mediaUrls.length > 0 ? rpcResult.mediaUrls : mediaUrls,
      row.id
    );
    dispatchSpotDeleted(row.id);
    return { ok: true as const, error: null };
  }

  console.warn("DELETE RPC failed, trying direct delete:", rpcResult.error);

  // 2) Direct delete — needs RLS policy on posts
  const directResult = await deletePostRowDirect(row.id, authUserId);

  if (!directResult.ok) {
    return {
      ok: false as const,
      error: `${directResult.error} (RPC also failed: ${rpcResult.error})`,
    };
  }

  await removeSpotMediaBestEffort(mediaUrls, row.id);
  dispatchSpotDeleted(row.id);
  return { ok: true as const, error: null };
}

async function fetchOwnedPostRow(postId: string, userId: string) {
  const spotId = postIdForDelete(postId);

  if (!spotId) {
    return { row: null, error: "Invalid post id." };
  }

  const { row, error } = await fetchSpotRow(spotId);

  if (!row || row.user_id !== userId) {
    return { row: null, error: error ?? "Post not found or you cannot delete it." };
  }

  return { row: row as Record<string, unknown>, error: null };
}

/** Delete a post or story in public.posts. */
export async function deleteOwnedPost(postId: string, userId: string) {
  try {
    const { userId: authUserId, error: authError } = await getAuthenticatedUserId();

    if (!authUserId) {
      return { ok: false, error: authError ?? "Sign in required." };
    }

    if (userId && userId !== authUserId) {
      return { ok: false, error: "Sign in required." };
    }

    const normalizedId = postIdForDelete(String(postId));

    if (!normalizedId) {
      return { ok: false, error: "Invalid post id." };
    }

    const { row, error: fetchError } = await fetchOwnedPostRow(normalizedId, authUserId);

    if (row && String(row.content_kind ?? "") === "story") {
      return deleteOwnedStory(normalizedId, authUserId);
    }

    const mediaUrls = row ? collectMediaUrls(row) : [];
    const rpcResult = await deletePostViaRpc(normalizedId, authUserId);

    if (rpcResult.ok) {
      await removeSpotMediaBestEffort(
        rpcResult.mediaUrls.length > 0 ? rpcResult.mediaUrls : mediaUrls,
        normalizedId
      );
      return { ok: true, error: null };
    }

    const directResult = await deletePostRowDirect(normalizedId, authUserId);

    if (!directResult.ok) {
      return { ok: false, error: directResult.error ?? fetchError ?? "Unable to delete." };
    }

    await removeSpotMediaBestEffort(mediaUrls, normalizedId);
    return { ok: true, error: null };
  } catch (err) {
    console.error("DELETE CRASH:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Delete a story from stories table and/or posts fallback. */
export async function deleteOwnedStory(storyId: string, userId: string) {
  try {
    const { userId: authUserId, error: authError } = await getAuthenticatedUserId();

    if (!authUserId) {
      return { ok: false, error: authError ?? "Sign in required." };
    }

    if (userId && userId !== authUserId) {
      return { ok: false, error: "Sign in required." };
    }

    const mediaUrls: string[] = [];
    const queryId = postIdForQuery(storyId);

    const { data: storyRow, error: storyFetchError } = await supabase
      .from("stories")
      .select("id, user_id, media_url")
      .eq("id", queryId)
      .eq("user_id", authUserId)
      .maybeSingle();

    if (!storyFetchError && storyRow) {
      if (typeof storyRow.media_url === "string") {
        mediaUrls.push(storyRow.media_url);
      }

      await supabase.from("stories").delete().eq("id", queryId).eq("user_id", authUserId);
    } else if (storyFetchError && !isStoriesRelationMissing(storyFetchError)) {
      return { ok: false, error: storyFetchError.message };
    }

    const directResult = await deletePostRowDirect(postIdForDelete(storyId) ?? String(queryId), authUserId);

    if (!directResult.ok && !storyRow) {
      return { ok: false, error: "Story not found or you cannot delete it." };
    }

    await removeSpotMediaBestEffort(mediaUrls, storyId);
    return { ok: true, error: null };
  } catch (err) {
    console.error("DELETE CRASH:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
