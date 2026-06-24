import type { MapSpotPin } from "@/lib/spots";

export function getMapSpotPinPreviewUrl(pin: MapSpotPin): string | null {
  return (
    pin.video_cover_url ?? pin.thumbnail_url ?? (pin.media_type === "image" ? pin.media_url : null)
  );
}

export function getMapSpotPinTitle(pin: MapSpotPin): string {
  return pin.spot_name?.trim() || pin.label || "Spot";
}

/** MapLibre expects [longitude, latitude]. Returns null when coordinates are invalid. */
export function resolveSpotMapLngLat(
  pin: Pick<MapSpotPin, "id" | "latitude" | "longitude">
): [number, number] | null {
  const latitude = Number(pin.latitude);
  const longitude = Number(pin.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.warn("[Map Spot Marker] missing coordinates", {
      spotId: pin.id,
      latitude: pin.latitude,
      longitude: pin.longitude,
    });
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    console.warn("[Map Spot Marker] missing coordinates", {
      spotId: pin.id,
      latitude,
      longitude,
      reason: "out_of_range",
    });
    return null;
  }

  return [longitude, latitude];
}
