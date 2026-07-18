import { postIdForQuery } from "@/lib/postIds";
import { publicProfileUsername } from "@/lib/publicProfile";
import { logExactLoadError } from "@/lib/safeLoad";
import { supabase } from "@/lib/supabaseClient";
import { toUserFacingError } from "@/lib/userFacingError";

export type PostCommentProfile = {
  username: string;
  avatar_url: string | null;
};

export type PostCommentRow = {
  id: number;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  profiles: PostCommentProfile;
};

const COMMENT_SELECT = `
  id,
  post_id,
  user_id,
  content,
  created_at,
  edited_at,
  profiles!post_comments_user_id_fkey (
    username,
    avatar_url
  )
`;

export const POST_COMMENTS_MIGRATION_HINT =
  "Comments are temporarily unavailable. Please try again later.";

export function isMissingPostCommentsTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    (error.code === "PGRST205" && message.includes("post_comments")) ||
    message.includes("post_comments") && message.includes("does not exist")
  );
}

function formatCommentsError(error: { code?: string; message?: string } | null) {
  if (isMissingPostCommentsTable(error)) {
    return POST_COMMENTS_MIGRATION_HINT;
  }

  return toUserFacingError(error, "Unable to load comments.");
}

function normalizeCommentRow(
  row: PostCommentRow & { profiles: PostCommentProfile | PostCommentProfile[] }
): PostCommentRow {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    post_id: row.post_id,
    user_id: row.user_id,
    content: row.content,
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
    profiles: {
      username: publicProfileUsername(profile.username),
      avatar_url: profile.avatar_url ?? null,
    },
  };
}

export async function loadPostComments(postId: string): Promise<{
  comments: PostCommentRow[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("post_comments")
      .select(COMMENT_SELECT)
      .eq("post_id", postIdForQuery(postId))
      .order("created_at", { ascending: true });

    if (error) {
      logExactLoadError(error);
      return { comments: [], error: formatCommentsError(error) };
    }

    const comments = (data ?? []).map((row) =>
      normalizeCommentRow(row as PostCommentRow & { profiles: PostCommentProfile | PostCommentProfile[] })
    );

    return { comments, error: null };
  } catch (error) {
    logExactLoadError(error);
    return {
      comments: [],
      error: error instanceof Error && error.message.trim() ? error.message : null,
    };
  }
}

export async function loadPostCommentsCount(postId: string): Promise<{
  count: number;
  error: string | null;
}> {
  try {
    const { count, error } = await supabase
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postIdForQuery(postId));

    if (error) {
      logExactLoadError(error);
      return { count: 0, error: formatCommentsError(error) };
    }

    return { count: count ?? 0, error: null };
  } catch (error) {
    logExactLoadError(error);
    return {
      count: 0,
      error: error instanceof Error && error.message.trim() ? error.message : null,
    };
  }
}

/**
 * Maps a raised-in-Postgres guard-trigger error (post_comments_guard_owner_edit, see
 * database/add-post-comment-edit-delete.sql) to the exact English catalog string for that case,
 * so localizeUserMessage's reverse-lookup can translate it like any other error.
 */
export function mapCommentActionError(kind: "edit" | "delete", message: string | null | undefined): string {
  const text = (message ?? "").toLowerCase();

  if (kind === "edit" && text.includes("edit window has expired")) {
    return "You can no longer edit this comment.";
  }

  return kind === "delete" ? "Unable to delete this comment." : "Unable to save your edit.";
}

export async function addPostComment(
  postId: string,
  userId: string,
  content: string
): Promise<{ comment: PostCommentRow | null; error: string | null }> {
  const trimmed = content.trim();

  if (!trimmed) {
    return { comment: null, error: "Write a comment before posting." };
  }

  try {
    const { data, error } = await supabase
      .from("post_comments")
      .insert({
        post_id: postIdForQuery(postId),
        user_id: userId,
        content: trimmed,
      })
      .select(COMMENT_SELECT)
      .single();

    if (error) {
      logExactLoadError(error);
      return {
        comment: null,
        error: isMissingPostCommentsTable(error)
          ? POST_COMMENTS_MIGRATION_HINT
          : toUserFacingError(error, "Unable to post comment."),
      };
    }

    return {
      comment: normalizeCommentRow(data as PostCommentRow & { profiles: PostCommentProfile | PostCommentProfile[] }),
      error: null,
    };
  } catch (error) {
    logExactLoadError(error);
    return {
      comment: null,
      error: toUserFacingError(error, "Unable to post comment."),
    };
  }
}

/**
 * Edits the author's own comment. Ownership and the 15-minute edit window (COMMENT_EDIT_WINDOW_MS
 * in lib/commentEditWindow.ts) are both enforced client-side before calling this, and again on
 * the server by the post_comments_guard_owner_edit trigger + "Users can update own comments" RLS
 * policy — so a stale client can never bypass either rule.
 */
export async function updatePostComment(
  commentId: number,
  userId: string,
  content: string
): Promise<{ comment: PostCommentRow | null; error: string | null }> {
  const trimmed = content.trim();

  if (!trimmed) {
    return { comment: null, error: "Comment cannot be empty." };
  }

  try {
    const { data, error, status, statusText } = await supabase
      .from("post_comments")
      .update({ content: trimmed, edited_at: new Date().toISOString() })
      .eq("id", commentId)
      .eq("user_id", userId)
      .select(COMMENT_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[updatePostComment] Supabase update failed", {
        commentId,
        userId,
        status,
        statusText,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      return { comment: null, error: mapCommentActionError("edit", error.message) };
    }

    // RLS/the guard trigger silently filters non-matching rows (wrong author, or the edit
    // window already expired) instead of raising an error — a zero-row "success" is really a
    // rejection, so it's treated as one and logged the same way a real error would be.
    if (!data) {
      console.error("[updatePostComment] update matched zero rows (ownership/window failure)", {
        commentId,
        userId,
      });

      return { comment: null, error: "Unable to save your edit." };
    }

    return {
      comment: normalizeCommentRow(data as PostCommentRow & { profiles: PostCommentProfile | PostCommentProfile[] }),
      error: null,
    };
  } catch (error) {
    console.error("[updatePostComment] threw", error);
    return { comment: null, error: toUserFacingError(error, "Unable to save your edit.") };
  }
}

/**
 * Hard-deletes the author's own comment. Deleting has no time limit, so only ownership is
 * checked (client-side here, and by the "Users can delete own comments" RLS policy on the
 * server).
 */
export async function deletePostComment(
  commentId: number,
  userId: string
): Promise<{ error: string | null }> {
  try {
    const { data, error, status, statusText } = await supabase
      .from("post_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", userId)
      .select("id, user_id, post_id");

    if (error) {
      console.error("[deletePostComment] Supabase delete failed", {
        commentId,
        userId,
        status,
        statusText,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      return { error: mapCommentActionError("delete", error.message) };
    }

    if (!data || data.length === 0) {
      const { data: existingRow, error: lookupError } = await supabase
        .from("post_comments")
        .select("id, user_id, post_id")
        .eq("id", commentId)
        .maybeSingle();

      console.error("[deletePostComment] delete matched zero rows (permission/ownership failure)", {
        commentId,
        currentUserId: userId,
        rowOwnerId: existingRow?.user_id ?? null,
        rowExists: Boolean(existingRow),
        lookupError: lookupError?.message ?? null,
      });

      return { error: "Unable to delete this comment." };
    }

    return { error: null };
  } catch (error) {
    console.error("[deletePostComment] threw", error);
    return { error: toUserFacingError(error, "Unable to delete this comment.") };
  }
}
