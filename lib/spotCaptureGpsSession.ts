import { isCapacitorNative } from "@/lib/capacitorUtils";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { spotLocationFromCoordinates } from "@/lib/spotLocation";

/** Ignore fixes older than this (ms). */
export const SPOT_GPS_STALE_MS = 5_000;
/** Prefer a fresh high-accuracy update when worse than this (meters). */
export const SPOT_GPS_POOR_ACCURACY_M = 30;
/** Max wait for a high-accuracy refresh at freeze / capture time. */
export const SPOT_GPS_FRESH_FIX_WAIT_MS = 2_000;

export type SpotGpsFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
  speed: number | null;
  heading: number | null;
};

type SpotCaptureGpsSession = {
  start: () => void;
  stop: () => void;
  /**
   * Clear a previous freeze and resume watching so a new shutter press
   * can freeze again (e.g. after a failed recording attempt).
   */
  prepareCapture: () => void;
  /** Snapshot the best fix at capture time; never updates after resolve. */
  freeze: () => Promise<SpotGpsFix>;
  getLatest: () => SpotGpsFix | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSpeed(value: unknown): number | null {
  if (!isFiniteNumber(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeHeading(value: unknown): number | null {
  if (!isFiniteNumber(value) || value < 0) {
    return null;
  }

  return value;
}

export function spotGpsFixFromPosition(position: {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number | null;
    heading: number | null;
  };
}): SpotGpsFix | null {
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;

  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: isFiniteNumber(position.coords.accuracy) ? position.coords.accuracy : null,
    timestamp: isFiniteNumber(position.timestamp) ? position.timestamp : Date.now(),
    speed: normalizeSpeed(position.coords.speed),
    heading: normalizeHeading(position.coords.heading),
  };
}

function fixAgeMs(fix: SpotGpsFix, now = Date.now()) {
  return Math.max(0, now - fix.timestamp);
}

function isFreshFix(fix: SpotGpsFix | null, now = Date.now()): fix is SpotGpsFix {
  return Boolean(fix && fixAgeMs(fix, now) <= SPOT_GPS_STALE_MS);
}

/** Prefer fresher and more accurate fixes. */
function shouldReplaceFix(current: SpotGpsFix | null, next: SpotGpsFix, now = Date.now()) {
  if (!isFreshFix(next, now)) {
    return false;
  }

  if (!current || !isFreshFix(current, now)) {
    return true;
  }

  const nextAccuracy = next.accuracy ?? Number.POSITIVE_INFINITY;
  const currentAccuracy = current.accuracy ?? Number.POSITIVE_INFINITY;

  if (nextAccuracy + 2 < currentAccuracy) {
    return true;
  }

  if (next.timestamp > current.timestamp && nextAccuracy <= currentAccuracy + 5) {
    return true;
  }

  return next.timestamp > current.timestamp + 1_000;
}

async function readHighAccuracyFix(timeoutMs: number): Promise<SpotGpsFix | null> {
  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: timeoutMs,
    maximumAge: 0,
  };

  try {
    if (isCapacitorNative()) {
      const { Geolocation } = await import("@capacitor/geolocation");

      try {
        await Geolocation.requestPermissions?.();
      } catch {
        // ignore
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      });

      return spotGpsFixFromPosition(position);
    }

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return null;
    }

    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(spotGpsFixFromPosition(position)),
        () => resolve(null),
        options
      );
    });
  } catch {
    return null;
  }
}

/**
 * Continuous high-accuracy GPS while the camera is open.
 * Freeze at shutter press so posts never get a later/moving position.
 */
export function createSpotCaptureGpsSession(): SpotCaptureGpsSession {
  let latest: SpotGpsFix | null = null;
  let frozen: SpotGpsFix | null = null;
  let watchId: number | string | null = null;
  let stopped = false;
  let capacitorWatchId: string | null = null;

  const ingest = (fix: SpotGpsFix | null) => {
    if (!fix || frozen || stopped) {
      return;
    }

    if (shouldReplaceFix(latest, fix)) {
      latest = fix;
    }
  };

  const startBrowserWatch = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        ingest(spotGpsFixFromPosition(position));
      },
      () => {
        // Keep last good fix; freeze path will try a one-shot refresh.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1_000,
        timeout: 10_000,
      }
    );
  };

  const startCapacitorWatch = async () => {
    const { Geolocation } = await import("@capacitor/geolocation");

    try {
      await Geolocation.requestPermissions?.();
    } catch {
      // ignore
    }

    // Seed immediately so capture soon after open still has a fix.
    try {
      const seed = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: SPOT_GPS_FRESH_FIX_WAIT_MS,
        maximumAge: 0,
      });
      ingest(spotGpsFixFromPosition(seed));
    } catch {
      // Watch will keep trying.
    }

    if (stopped || frozen) {
      return;
    }

    capacitorWatchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 1_000,
      },
      (position, error) => {
        if (error || !position) {
          return;
        }

        ingest(spotGpsFixFromPosition(position));
      }
    );
  };

  const clearWatches = () => {
    if (typeof watchId === "number" && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    if (capacitorWatchId) {
      const id = capacitorWatchId;
      capacitorWatchId = null;
      void import("@capacitor/geolocation")
        .then(({ Geolocation }) => Geolocation.clearWatch({ id }))
        .catch(() => undefined);
    }
  };

  const start = () => {
    stopped = false;
    frozen = null;
    clearWatches();

    if (isCapacitorNative()) {
      void startCapacitorWatch();
      return;
    }

    void readHighAccuracyFix(SPOT_GPS_FRESH_FIX_WAIT_MS).then(ingest);
    startBrowserWatch();
  };

  const stop = () => {
    stopped = true;
    clearWatches();
  };

  const prepareCapture = () => {
    if (!frozen && !stopped) {
      return;
    }

    frozen = null;
    start();
  };

  const freeze = async () => {
    if (frozen) {
      return frozen;
    }

    // Snapshot at shutter press before any refresh wait.
    const now = Date.now();
    let candidate = isFreshFix(latest, now) ? { ...latest } : null;

    const needsRefresh =
      !candidate ||
      candidate.accuracy == null ||
      candidate.accuracy > SPOT_GPS_POOR_ACCURACY_M;

    if (needsRefresh) {
      const refreshed = await readHighAccuracyFix(SPOT_GPS_FRESH_FIX_WAIT_MS);

      if (refreshed && shouldReplaceFix(candidate, refreshed, Date.now())) {
        candidate = { ...refreshed };
      } else if (!candidate && refreshed) {
        candidate = { ...refreshed };
      }
    }

    if (!candidate) {
      // Last resort: accept whatever we have, even if slightly stale.
      candidate = latest ? { ...latest } : null;
    }

    if (!candidate) {
      throw new Error("Unable to capture GPS location.");
    }

    frozen = candidate;
    stop();
    return frozen;
  };

  return {
    start,
    stop,
    prepareCapture,
    freeze,
    getLatest: () => frozen ?? latest,
  };
}

export async function spotGeoLocationFromGpsFix(fix: SpotGpsFix): Promise<SpotGeoLocation> {
  const location = await spotLocationFromCoordinates(fix.latitude, fix.longitude);

  return {
    ...location,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    capturedAt: fix.timestamp,
    speed: fix.speed,
    heading: fix.heading,
  };
}
