import type { SpotGeoLocation } from "@/lib/spotLocation";

export type SpotCreateLaunch =
  | { kind: "gps" }
  | { kind: "map-text-card"; location: SpotGeoLocation };

export const DEFAULT_SPOT_CREATE_LAUNCH: SpotCreateLaunch = { kind: "gps" };
