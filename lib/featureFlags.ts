/**
 * SpotDrop feature flags (legacy helpers).
 * PANO has been removed from the camera mode selector and production capture
 * flow. This flag is kept only so any leftover caller fails closed instead of
 * erroring; the native pano plugin/package still exist on disk but are no
 * longer wired into the app build.
 */
export const SPOTDROP_PANO_FEATURE_FLAG = "spotdrop.pano.devEnabled";

/** @deprecated PANO capture has been removed — always returns false. */
export function isSpotDropPanoFeatureEnabled(): boolean {
  return false;
}
