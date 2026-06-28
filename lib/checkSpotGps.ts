import { isCapacitorNative } from "@/lib/capacitorUtils";

export const CHECKSPOT_MAX_ACCURACY_METERS = 1000;

export type CheckSpotGpsReading = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

export type CheckSpotCoordinateValidation =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: string };

export function validateCheckSpotCoordinates(
  latitude: number,
  longitude: number
): CheckSpotCoordinateValidation {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    console.error("[CheckSpot] rejected stale/invalid coords", {
      latitude,
      longitude,
      reason: "non-finite",
    });

    return { ok: false, reason: "non-finite" };
  }

  if (latitude === 0 && longitude === 0) {
    console.error("[CheckSpot] rejected stale/invalid coords", {
      latitude,
      longitude,
      reason: "null-island",
    });

    return { ok: false, reason: "null-island" };
  }

  const latOutOfRange = Math.abs(latitude) > 90;
  const lngOutOfRange = Math.abs(longitude) > 180;

  if (latOutOfRange && Math.abs(longitude) <= 90 && Math.abs(latitude) <= 180) {
    console.error("[CheckSpot] rejected stale/invalid coords", {
      latitude,
      longitude,
      reason: "swapped",
    });

    return { ok: false, reason: "swapped" };
  }

  if (latOutOfRange || lngOutOfRange) {
    console.error("[CheckSpot] rejected stale/invalid coords", {
      latitude,
      longitude,
      reason: "out-of-range",
    });

    return { ok: false, reason: "out-of-range" };
  }

  return { ok: true, latitude, longitude };
}

function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as GeolocationPositionError).code === "number"
  );
}

function mapGeolocationError(error: GeolocationPositionError) {
  const permissionDenied = error.code === 1;

  return permissionDenied
    ? "Location access is required for CheckSpot."
    : error.message || "Unable to detect your location.";
}

async function readFreshGpsPosition(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}> {
  if (isCapacitorNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");

    try {
      await Geolocation.requestPermissions?.();
    } catch {
      // requestPermissions is a no-op on some platforms; ignore.
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Location is not available on this device.");
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

export async function requestCheckSpotGpsReading(): Promise<{
  reading: CheckSpotGpsReading | null;
  error: string | null;
}> {
  try {
    const position = await readFreshGpsPosition();
    const latitude = position.latitude;
    const longitude = position.longitude;
    const accuracyMeters = position.accuracy;

    const validated = validateCheckSpotCoordinates(latitude, longitude);

    if (!validated.ok) {
      return {
        reading: null,
        error: "Location unavailable.",
      };
    }

    if (!Number.isFinite(accuracyMeters) || accuracyMeters > CHECKSPOT_MAX_ACCURACY_METERS) {
      console.error("[CheckSpot] rejected stale/invalid coords", {
        latitude: validated.latitude,
        longitude: validated.longitude,
        accuracyMeters,
        reason: "accuracy-too-low",
      });

      return {
        reading: null,
        error: "Location accuracy is too low, please try again.",
      };
    }

    const reading: CheckSpotGpsReading = {
      latitude: validated.latitude,
      longitude: validated.longitude,
      accuracyMeters,
      capturedAt: new Date(position.timestamp).toISOString(),
    };

    return { reading, error: null };
  } catch (caught) {
    if (isGeolocationPositionError(caught)) {
      return { reading: null, error: mapGeolocationError(caught) };
    }

    return {
      reading: null,
      error: caught instanceof Error ? caught.message : "Unable to detect your location.",
    };
  }
}

export function logCheckSpotReceiverCoords(reading: CheckSpotGpsReading) {
  console.log("[CheckSpot] receiver coords", reading);
}
