/**
 * Unique Spot opens (full viewer) — not Search grid impressions and not "See Spot" visits.
 * Viewer id is resolved server-side via auth.uid(); client never sends viewer_id.
 */

import { isDemoPostId, postIdForQuery } from "@/lib/postIds";
import { dispatchSpotStatsUpdated } from "@/lib/spotStatsEvents";
import { supabase } from "@/lib/supabaseClient";

type RecordSpotUniqueViewResult = {
  uniqueViewCount: number | null;
  inserted: boolean;
  error: string | null;
};

const inFlightSpotIds = new Set<string>();
const recordedSpotIds = new Set<string>();

export type RecordSpotUniqueViewInput = {
  spotId: string;
  /** Used only for client-side owner skip; server also enforces via auth.uid(). */
  ownerId?: string | null;
  viewerId?: string | null;
};

export async function recordSpotUniqueView({
  spotId,
  ownerId = null,
  viewerId = null,
}: RecordSpotUniqueViewInput): Promise<RecordSpotUniqueViewResult> {
  const id = spotId.trim();

  if (!id || isDemoPostId(id)) {
    return { uniqueViewCount: null, inserted: false, error: null };
  }

  if (!viewerId) {
    return { uniqueViewCount: null, inserted: false, error: null };
  }

  if (ownerId && viewerId === ownerId) {
    return { uniqueViewCount: null, inserted: false, error: null };
  }

  if (recordedSpotIds.has(id) || inFlightSpotIds.has(id)) {
    return { uniqueViewCount: null, inserted: false, error: null };
  }

  inFlightSpotIds.add(id);

  try {
    const { data, error } = await supabase.rpc("record_spot_unique_view", {
      p_spot_id: postIdForQuery(id),
    });

    if (error) {
      // Column/RPC not migrated yet — fail soft.
      if (error.code === "42883" || error.code === "42703") {
        console.warn("[spot-unique-view] RPC unavailable", { spotId: id, code: error.code });
        return { uniqueViewCount: null, inserted: false, error: null };
      }

      console.warn("[spot-unique-view] RPC error", { spotId: id, code: error.code });
      return { uniqueViewCount: null, inserted: false, error: error.message };
    }

    const payload = data as {
      ok?: boolean;
      inserted?: boolean;
      unique_view_count?: number | null;
      error?: string;
      skipped_owner?: boolean;
    } | null;

    if (!payload || payload.ok === false) {
      return {
        uniqueViewCount: null,
        inserted: false,
        error: payload?.error ?? "view_not_recorded",
      };
    }

    recordedSpotIds.add(id);

    const uniqueViewCount =
      payload.unique_view_count != null
        ? Math.max(0, Number(payload.unique_view_count) || 0)
        : null;

    if (uniqueViewCount != null) {
      dispatchSpotStatsUpdated({
        postId: id,
        unique_view_count: uniqueViewCount,
      });
    }

    return {
      uniqueViewCount,
      inserted: Boolean(payload.inserted),
      error: null,
    };
  } catch (caught) {
    console.warn(
      "[spot-unique-view] threw",
      caught instanceof Error ? caught.name : "unknown"
    );
    return { uniqueViewCount: null, inserted: false, error: null };
  } finally {
    inFlightSpotIds.delete(id);
  }
}
