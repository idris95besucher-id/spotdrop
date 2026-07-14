import { resolveMapLngLat, type MapLngLat } from "@/lib/mapMarkerCoords";
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
): MapLngLat | null {
  return resolveMapLngLat(pin.latitude, pin.longitude, {
    kind: "spot",
    id: pin.id,
  });
}
