import { readGpsFromMediaFile } from "@/lib/spotExif";
import { spotLocationFromMediaFile } from "@/lib/spotMediaLocation";
import {
  requestDeviceLocation,
  requestDeviceLocationFast,
  spotLocationFromCoordinates,
  type SpotGeoLocation,
} from "@/lib/spotLocation";

export const SPOT_AUTO_LOCATION_FAILED_MESSAGE =
  "Unable to determine your location. Please enable Location Services and take the first photo again." as const;

function hasValidCoordinates(location: SpotGeoLocation | null | undefined) {
  if (!location) {
    return false;
  }

  return Number.isFinite(location.latitude) && Number.isFinite(location.longitude);
}

/**
 * Resolve Spot location from the mandatory first camera photo.
 * Tries EXIF/GPS embedded in the file, then device GPS at capture time.
 */
export async function resolveSpotLocationFromFirstPhoto(
  photoFile: File
): Promise<SpotGeoLocation | null> {
  try {
    const fromMedia = await spotLocationFromMediaFile(photoFile);

    if (hasValidCoordinates(fromMedia)) {
      return fromMedia;
    }
  } catch {
    // Fall through to device GPS.
  }

  try {
    const gps = await readGpsFromMediaFile(photoFile);

    if (gps) {
      return spotLocationFromCoordinates(gps.latitude, gps.longitude);
    }
  } catch {
    // Fall through.
  }

  try {
    const fast = await requestDeviceLocationFast();
    return spotLocationFromCoordinates(fast.latitude, fast.longitude);
  } catch {
    // Fall through.
  }

  try {
    const precise = await requestDeviceLocation();
    return spotLocationFromCoordinates(precise.latitude, precise.longitude);
  } catch {
    return null;
  }
}

export function hasVerifiedSpotCaptureLocation(
  location: SpotGeoLocation | null | undefined
): location is SpotGeoLocation {
  return hasValidCoordinates(location);
}
