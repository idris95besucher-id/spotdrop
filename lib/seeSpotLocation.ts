import type { SpotLocationDisplayFields } from "@/lib/spotLocationDisplay";
import { recordSpotSeeVisit } from "@/lib/spotRanking";

type SeeSpotLocationInput = {
  location: SpotLocationDisplayFields;
  viewerId: string | null;
  ownerId?: string | null;
  authResolved?: boolean;
  currentVisitedCount?: number;
  openSpotLocation: (location: SpotLocationDisplayFields) => void;
};

/** Open spot location sheet and record a unique See Spot visit. */
export function seeSpotLocation({
  location,
  viewerId,
  ownerId = null,
  authResolved = true,
  currentVisitedCount,
  openSpotLocation,
}: SeeSpotLocationInput) {
  const postId = location.id;

  if (postId) {
    void recordSpotSeeVisit({
      postId,
      viewerId,
      ownerId: ownerId ?? location.user_id ?? null,
      authResolved,
      currentVisitedCount,
    });
  }

  openSpotLocation(location);
}
