import { hasVerifiedSpotCaptureLocation } from "@/lib/spotCaptureLocation";
import {
  SPOT_GPS_FRESH_FIX_WAIT_MS,
  SPOT_GPS_POOR_ACCURACY_M,
  SPOT_GPS_STALE_MS,
  createSpotCaptureGpsSession,
  spotGeoLocationFromGpsFix,
} from "@/lib/spotCaptureGpsSession";
import {
  requestDeviceLocation,
  requestDeviceLocationFast,
  type SpotGeoLocation,
} from "@/lib/spotLocation";

export const SPOT_GPS_CAPTURE_FAILED_MESSAGE =
  "Unable to save your location. Please enable Location Services and try again." as const;

function isFreshEnough(location: SpotGeoLocation) {
  if (location.capturedAt == null) {
    return true;
  }

  return Date.now() - location.capturedAt <= SPOT_GPS_STALE_MS;
}

function needsAccuracyRefresh(location: SpotGeoLocation) {
  if (!isFreshEnough(location)) {
    return true;
  }

  if (location.accuracy == null) {
    return true;
  }

  return location.accuracy > SPOT_GPS_POOR_ACCURACY_M;
}

/**
 * One-shot capture for non-camera flows (text cards / form open).
 * Prefers a fresh high-accuracy fix; refreshes when accuracy is poor.
 */
export async function captureDeviceSpotLocation(): Promise<SpotGeoLocation> {
  let candidate: SpotGeoLocation | null = null;

  try {
    const fast = await requestDeviceLocationFast();

    if (hasVerifiedSpotCaptureLocation(fast) && isFreshEnough(fast)) {
      candidate = fast;
    }
  } catch {
    // Fall through to high-accuracy GPS.
  }

  if (!candidate || needsAccuracyRefresh(candidate)) {
    try {
      const precise = await Promise.race([
        requestDeviceLocation(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("GPS timeout")), SPOT_GPS_FRESH_FIX_WAIT_MS + 250);
        }),
      ]);

      if (hasVerifiedSpotCaptureLocation(precise)) {
        if (
          !candidate ||
          (precise.accuracy != null &&
            (candidate.accuracy == null || precise.accuracy <= candidate.accuracy))
        ) {
          candidate = precise;
        }
      }
    } catch {
      // Keep candidate if we have one.
    }
  }

  if (!candidate || !hasVerifiedSpotCaptureLocation(candidate)) {
    // Final attempt without the race timeout wrapper.
    const precise = await requestDeviceLocation();

    if (!hasVerifiedSpotCaptureLocation(precise)) {
      throw new Error(SPOT_GPS_CAPTURE_FAILED_MESSAGE);
    }

    return precise;
  }

  return candidate;
}

/**
 * Camera capture path: continuous GPS while open, freeze at shutter press.
 */
export async function freezeCameraSpotLocation(
  session: ReturnType<typeof createSpotCaptureGpsSession>
): Promise<SpotGeoLocation> {
  session.prepareCapture();
  const fix = await session.freeze();
  return spotGeoLocationFromGpsFix(fix);
}

export { createSpotCaptureGpsSession };
