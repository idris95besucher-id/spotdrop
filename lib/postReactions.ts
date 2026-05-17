import { postIdForQuery } from "@/lib/postIds";
import { logExactLoadError, userFacingSupabaseListError } from "@/lib/safeLoad";
import { supabase } from "@/lib/supabaseClient";

export type PostReactionType = "like" | "useful";

export type PostReactionState = {
  likeCount: number;
  usefulCount: number;
  userLiked: boolean;
  userMarkedUseful: boolean;
};

const EMPTY_REACTIONS: PostReactionState = {
  likeCount: 0,
  usefulCount: 0,
  userLiked: false,
  userMarkedUseful: false,
};

export async function loadPostReactions(postId: string, userId: string | null): Promise<{
  data: PostReactionState;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("post_reactions")
      .select("reaction_type, user_id")
      .eq("post_id", postIdForQuery(postId));

    if (error) {
      logExactLoadError(error);
      return {
        data: EMPTY_REACTIONS,
        error: userFacingSupabaseListError(error),
      };
    }

    const rows = data ?? [];
    let likeCount = 0;
    let usefulCount = 0;
    let userLiked = false;
    let userMarkedUseful = false;

    for (const row of rows) {
      if (row.reaction_type === "like") {
        likeCount += 1;
        if (userId && row.user_id === userId) {
          userLiked = true;
        }
      }

      if (row.reaction_type === "useful") {
        usefulCount += 1;
        if (userId && row.user_id === userId) {
          userMarkedUseful = true;
        }
      }
    }

    return {
      data: { likeCount, usefulCount, userLiked, userMarkedUseful },
      error: null,
    };
  } catch (error) {
    logExactLoadError(error);
    return {
      data: EMPTY_REACTIONS,
      error: error instanceof Error && error.message.trim() ? error.message : null,
    };
  }
}

export async function togglePostReaction(
  postId: string,
  userId: string,
  reactionType: PostReactionType,
  isActive: boolean
): Promise<{ error: string | null }> {
  try {
    if (isActive) {
      const { error } = await supabase
        .from("post_reactions")
        .delete()
        .eq("post_id", postIdForQuery(postId))
        .eq("user_id", userId)
        .eq("reaction_type", reactionType);

      if (error) {
        logExactLoadError(error);
        return { error: error.message || "Unable to update reaction." };
      }

      return { error: null };
    }

    const { error } = await supabase.from("post_reactions").insert({
      post_id: postIdForQuery(postId),
      user_id: userId,
      reaction_type: reactionType,
    });

    if (error) {
      logExactLoadError(error);
      return { error: error.message || "Unable to update reaction." };
    }

    return { error: null };
  } catch (error) {
    logExactLoadError(error);
    return { error: error instanceof Error ? error.message : "Unable to update reaction." };
  }
}
