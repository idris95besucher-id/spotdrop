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
  profiles: PostCommentProfile;
};

const COMMENT_SELECT = `
  id,
  post_id,
  user_id,
  content,
  created_at,
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
