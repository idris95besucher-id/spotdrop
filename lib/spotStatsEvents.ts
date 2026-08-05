export const SPOT_STATS_UPDATED_EVENT = "spotdrop:spot-stats-updated";

export type SpotStatsUpdatedDetail = {
  postId: string;
  visited_count?: number;
  comments_count?: number;
  saved_count?: number;
  /** Unique full-Spot opens — Search grid Eye badge only. */
  unique_view_count?: number;
};

export function dispatchSpotStatsUpdated(detail: SpotStatsUpdatedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(SPOT_STATS_UPDATED_EVENT, { detail }));
}
