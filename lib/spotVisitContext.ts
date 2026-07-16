/** Viewer context carried alongside an open Spot location sheet, used to record
 * a "See Spot" visit only once the map is actually shown (see SpotLocationSheet). */
export type SpotLocationViewerContext = {
  viewerId: string | null;
  ownerId: string | null;
  authResolved: boolean;
  currentVisitedCount?: number;
};
