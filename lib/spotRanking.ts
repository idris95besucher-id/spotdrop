import { postIdForQuery } from "@/lib/postIds";
import { dispatchSpotStatsUpdated } from "@/lib/spotStatsEvents";
import { supabase } from "@/lib/supabaseClient";

export type SpotPublicStats = {
  visited_count: number;
  comments_count: number;
  saved_count: number;
};

export const EMPTY_SPOT_PUBLIC_STATS: SpotPublicStats = {
  visited_count: 0,
  comments_count: 0,
  saved_count: 0,
};

export function normalizeSpotPublicStats(
  row:
    | Partial<{
        visited_count: number | null;
        comments_count: number | null;
        collection_save_count: number | null;
        saved_count: number | null;
      }>
    | null
    | undefined
): SpotPublicStats {
  return {
    visited_count: Math.max(0, Number(row?.visited_count ?? 0) || 0),
    comments_count: Math.max(0, Number(row?.comments_count ?? 0) || 0),
    saved_count: Math.max(
      0,
      Number(row?.collection_save_count ?? row?.saved_count ?? 0) || 0
    ),
  };
}

export async function loadSpotPublicStats(postId: string): Promise<SpotPublicStats | null> {
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("visited_count, comments_count, collection_save_count")
      .eq("id", postIdForQuery(postId))
      .eq("content_kind", "spot")
      .maybeSingle();

    if (error || !data) {
      if (error && !isMissingSpotRankingColumns(error)) {
        console.error("[loadSpotPublicStats] failed:", error);
      }
      return null;
    }

    return normalizeSpotPublicStats(data);
  } catch (error) {
    console.error("[loadSpotPublicStats] threw:", error);
    return null;
  }
}

export async function refreshSpotPublicStatsEvent(postId: string) {
  const stats = await loadSpotPublicStats(postId);

  if (!stats) {
    return;
  }

  dispatchSpotStatsUpdated({
    postId,
    visited_count: stats.visited_count,
    comments_count: stats.comments_count,
    saved_count: stats.saved_count,
  });
}

export function isMissingSpotRankingColumns(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" &&
    (message.includes("visited_count") ||
      message.includes("comments_count") ||
      message.includes("spot_rank_score") ||
      message.includes("collection_save_count") ||
      message.includes("views_count"))
  );
}

export async function recordSpotVisited(postId: string): Promise<{
  visitedCount: number | null;
  incremented: boolean;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc("record_spot_visited", {
      p_post_id: postIdForQuery(postId),
    });

    if (error) {
      if (isMissingSpotRankingColumns(error) || error.code === "42883") {
        return { visitedCount: null, incremented: false, error: null };
      }

      return { visitedCount: null, incremented: false, error: error.message };
    }

    const payload = data as { ok?: boolean; visited_count?: number; incremented?: boolean } | null;

    return {
      visitedCount:
        payload?.visited_count != null ? Math.max(0, Number(payload.visited_count)) : null,
      incremented: Boolean(payload?.incremented),
      error: null,
    };
  } catch {
    return { visitedCount: null, incremented: false, error: null };
  }
}

export async function recordSpotOpen(postId: string, isAuthenticated: boolean): Promise<void> {
  if (isAuthenticated) {
    const result = await recordSpotVisited(postId);

    if (result.visitedCount != null) {
      dispatchSpotStatsUpdated({
        postId,
        visited_count: result.visitedCount,
      });
    }

    return;
  }

  await recordSpotView(postId);
}

export async function recordSpotView(postId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("record_spot_view", {
      p_post_id: postIdForQuery(postId),
    });

    if (error && !isMissingSpotRankingColumns(error) && error.code !== "42883") {
      console.error("record_spot_view failed:", error);
    }
  } catch (error) {
    console.error("record_spot_view failed:", error);
  }
}
