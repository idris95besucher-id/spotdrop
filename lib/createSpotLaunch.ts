/** Spot create opens the camera immediately; GPS is captured in the background. */
export type SpotCreateLaunch = { kind: "gps" };

export const DEFAULT_SPOT_CREATE_LAUNCH: SpotCreateLaunch = { kind: "gps" };
