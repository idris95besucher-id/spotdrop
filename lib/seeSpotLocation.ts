import type { SpotLocationDisplayFields } from "@/lib/spotLocationDisplay";
import type { SpotLocationViewerContext } from "@/lib/spotVisitContext";

type SeeSpotLocationInput = {
  location: SpotLocationDisplayFields;
  viewerId: string | null;
  ownerId?: string | null;
  authResolved?: boolean;
  currentVisitedCount?: number;
  openSpotLocation: (location: SpotLocationDisplayFields, viewerContext: SpotLocationViewerContext) => void;
};

/**
 * Open the Spot location sheet. The visit itself is NOT recorded here — a
 * "See Spot" tap only opens the sheet; the actual visit is recorded later,
 * when the user taps "Open in Maps" and the map genuinely shows the Spot's
 * marker (see SpotLocationSheet.tsx).
 */
export function seeSpotLocation({
  location,
  viewerId,
  ownerId = null,
  authResolved = true,
  currentVisitedCount,
  openSpotLocation,
}: SeeSpotLocationInput) {
  openSpotLocation(location, {
    viewerId,
    ownerId: ownerId ?? location.user_id ?? null,
    authResolved,
    currentVisitedCount,
  });
}
