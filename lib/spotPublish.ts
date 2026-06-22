import type { SpotGeoLocation } from "@/lib/spotLocation";

export const DEFAULT_SPOT_NAME = "Untitled spot";

export const SPOT_LOCATION_REQUIRED_MESSAGE =
  "This Spot has no address. You can't publish it as a Spot.";

export type SpotPublishLocationFields = {
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  spot_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

export type SpotPublishBlockReason = "media" | "location_loading" | "location_required" | null;

function readSpotPublishLocationFields(
  fields: SpotGeoLocation | SpotPublishLocationFields
): SpotPublishLocationFields {
  if ("latitude" in fields) {
    return {
      latitude: fields.latitude,
      longitude: fields.longitude,
      address: fields.address,
    };
  }

  return {
    spot_latitude: fields.spot_latitude,
    spot_longitude: fields.spot_longitude,
    spot_address: fields.spot_address,
  };
}

/** True when coordinates or a street/place address exist (required to publish or show on Spots). */
export function hasSpotPublishLocation(
  fields: SpotGeoLocation | SpotPublishLocationFields | null | undefined
): boolean {
  if (!fields) {
    return false;
  }

  const { latitude, longitude, spot_latitude, spot_longitude, address, spot_address } =
    readSpotPublishLocationFields(fields);

  const lat = Number(latitude ?? spot_latitude);
  const lng = Number(longitude ?? spot_longitude);
  const addressText = (address ?? spot_address)?.trim();

  return (Number.isFinite(lat) && Number.isFinite(lng)) || Boolean(addressText);
}

export function resolveSpotName(spotName: string) {
  const trimmed = spotName.trim();

  if (trimmed) {
    return trimmed;
  }

  return DEFAULT_SPOT_NAME;
}

export function getSpotPublishBlockReason(options: {
  hasMedia: boolean;
  locating: boolean;
  location: SpotGeoLocation | null;
}): SpotPublishBlockReason {
  if (!options.hasMedia) {
    return "media";
  }

  if (options.locating && !hasSpotPublishLocation(options.location)) {
    return "location_loading";
  }

  if (!hasSpotPublishLocation(options.location)) {
    return "location_required";
  }

  return null;
}

export function spotPublishStatusMessage(reason: SpotPublishBlockReason) {
  switch (reason) {
    case "media":
      return "Media is missing";
    case "location_loading":
      return "Location is still loading";
    case "location_required":
      return SPOT_LOCATION_REQUIRED_MESSAGE;
    default:
      return null;
  }
}
