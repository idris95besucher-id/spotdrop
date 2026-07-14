/**
 * Shared geographic coordinate validation for MapLibre markers.
 * Never invent screen positions — invalid coords must not create markers.
 */

export type MapLngLat = [longitude: number, latitude: number];

export type ResolveMapLngLatOptions = {
  /** Short label for console.warn context, e.g. "live-user". */
  kind?: string;
  /** Optional id included in the warning. */
  id?: string;
  /**
   * Reject the Null Island / missing-data sentinel (0, 0).
   * Default true — SpotDrop never uses 0/0 as a real placement fallback.
   */
  rejectNullIsland?: boolean;
};

function warnInvalidMapCoords(
  kind: string,
  id: string | undefined,
  latitude: unknown,
  longitude: unknown,
  reason: string
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn(`[Map Marker] invalid coordinates (${kind})`, {
    id,
    latitude,
    longitude,
    reason,
  });
}

/**
 * Parse and validate latitude/longitude for map marker placement.
 * Returns MapLibre [lng, lat] or null when the marker must be hidden.
 */
export function resolveMapLngLat(
  latitude: unknown,
  longitude: unknown,
  options: ResolveMapLngLatOptions = {}
): MapLngLat | null {
  const kind = options.kind ?? "marker";
  const rejectNullIsland = options.rejectNullIsland !== false;

  if (latitude == null || longitude == null) {
    warnInvalidMapCoords(kind, options.id, latitude, longitude, "null_or_undefined");
    return null;
  }

  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    warnInvalidMapCoords(kind, options.id, latitude, longitude, "not_finite");
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    warnInvalidMapCoords(kind, options.id, lat, lng, "out_of_range");
    return null;
  }

  if (rejectNullIsland && lat === 0 && lng === 0) {
    warnInvalidMapCoords(kind, options.id, lat, lng, "null_island_0_0");
    return null;
  }

  return [lng, lat];
}

export function isValidMapCoordinatePair(
  latitude: unknown,
  longitude: unknown,
  options?: ResolveMapLngLatOptions
): boolean {
  return resolveMapLngLat(latitude, longitude, options) !== null;
}
