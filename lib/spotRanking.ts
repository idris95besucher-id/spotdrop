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

type RecordSpotSeeVisitResult = {
  visitedCount: number | null;
  incremented: boolean;
  error: string | null;
};

const spotSeeVisitInFlight = new Set<string>();
const spotSeeVisitRecorded = new Set<string>();

function spotSeeVisitSessionKey(postId: string, viewerId: string) {
  return `${postId}:${viewerId}`;
}

async function recordUniqueSpotSeeVisit(postId: string): Promise<RecordSpotSeeVisitResult> {
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

    const payload = data as {
      ok?: boolean;
      visited_count?: number;
      incremented?: boolean;
      error?: string;
    } | null;

    if (payload?.ok === false) {
      return {
        visitedCount: null,
        incremented: false,
        error: payload.error ?? "visit_not_recorded",
      };
    }

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

export type RecordSpotSeeVisitInput = {
  postId: string;
  viewerId: string | null;
  ownerId?: string | null;
  /** Wait until auth session is resolved so we never fire as anonymous then again as signed-in. */
  authResolved?: boolean;
};

/** Record a unique "See Spot" visit — not a passive open/view of the Spot detail. */
export async function recordSpotSeeVisit({
  postId,
  viewerId,
  ownerId = null,
  authResolved = true,
}: RecordSpotSeeVisitInput): Promise<RecordSpotSeeVisitResult> {
  if (!authResolved || !viewerId || !postId) {
    return { visitedCount: null, incremented: false, error: null };
  }

  if (ownerId && viewerId === ownerId) {
    return { visitedCount: null, incremented: false, error: null };
  }

  const sessionKey = spotSeeVisitSessionKey(postId, viewerId);

  if (spotSeeVisitRecorded.has(sessionKey) || spotSeeVisitInFlight.has(sessionKey)) {
    return { visitedCount: null, incremented: false, error: null };
  }

  spotSeeVisitInFlight.add(sessionKey);

  try {
    const result = await recordUniqueSpotSeeVisit(postId);
    spotSeeVisitRecorded.add(sessionKey);

    if (result.visitedCount != null) {
      dispatchSpotStatsUpdated({
        postId,
        visited_count: result.visitedCount,
      });
    }

    return result;
  } finally {
    spotSeeVisitInFlight.delete(sessionKey);
  }
}

/** @deprecated Use recordSpotSeeVisit */
export async function recordSpotVisited(
  postId: string,
  options: { viewerId?: string | null; ownerId?: string | null; authResolved?: boolean } = {}
): Promise<RecordSpotSeeVisitResult> {
  return recordSpotSeeVisit({
    postId,
    viewerId: options.viewerId ?? null,
    ownerId: options.ownerId ?? null,
    authResolved: options.authResolved ?? true,
  });
}
