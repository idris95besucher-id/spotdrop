import { isCapacitorNative } from "@/lib/capacitorUtils";

/** Spot / media load lifecycle — avoid showing error while still loading or retrying. */
export type SpotLoadPhase = "loading" | "mediaLoading" | "loaded" | "error";

export const SPOT_LOAD_ERROR = "Could not load spot. Try again.";

export function getSpotMediaLoadTimeoutMs(): number {
  return isCapacitorNative() ? 10_000 : 8_000;
}

/** Final fallback when Supabase detail fetch has no preview media to show. */
export const SPOT_DETAIL_FETCH_TIMEOUT_MS = 12_000;
