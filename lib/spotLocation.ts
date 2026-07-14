import { isCapacitorNative } from "@/lib/capacitorUtils";
import { canonicalizeGeoLocationFields } from "@/lib/i18n/canonicalGeo";
import type { I18nLocale } from "@/lib/i18n/locales";
import { formatSpotLocationLabelLocalized } from "@/lib/spotLocationDisplay";
import {
  extractConfidentStreetName,
  NOMINATIM_STREET_ZOOM,
  type NominatimReversePayload,
} from "@/lib/spotStreetName";
import { spotUploadTime } from "@/lib/spotUploadLog";

export const SPOT_MAX_VIDEO_SECONDS = 15;

export type SpotGeoLocation = {
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  country: string | null;
  /** Structured Nominatim address fields when reverse-geocode succeeded. */
  addressDetails?: Record<string, string | undefined> | null;
  /** Horizontal accuracy in meters at capture time (when available). */
  accuracy?: number | null;
  /** Device GPS timestamp (ms since epoch) when coordinates were frozen. */
  capturedAt?: number | null;
  /** Ground speed m/s when available. */
  speed?: number | null;
  /** Heading degrees when available. */
  heading?: number | null;
};

export type ReverseGeocodeResult = {
  address: string | null;
  city: string | null;
  country: string | null;
  /** Raw Nominatim address details for region/canton routing. */
  addressDetails?: Record<string, string | undefined> | null;
};

export type PlaceSearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
};

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "en",
};

function isBrowserOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function cityFromNominatimAddress(address: Record<string, string | undefined> | undefined) {
  if (!address) {
    return null;
  }

  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    null
  );
}

export async function spotLocationFromCoordinates(
  latitude: number,
  longitude: number
): Promise<SpotGeoLocation> {
  const finishLocation = spotUploadTime("location");

  try {
    const geocoded = await reverseGeocode(latitude, longitude);
    finishLocation();

    return {
      latitude,
      longitude,
      address: geocoded.address,
      city: geocoded.city,
      country: geocoded.country,
      addressDetails: geocoded.addressDetails ?? null,
    };
  } catch {
    finishLocation();

    return {
      latitude,
      longitude,
      address: null,
      city: null,
      country: null,
      addressDetails: null,
    };
  }
}

export function formatSpotLocationLabel(location: SpotGeoLocation, locale: I18nLocale = "en") {
  return formatSpotLocationLabelLocalized(location, locale);
}

async function resolveCoordinates(latitude: number, longitude: number): Promise<SpotGeoLocation> {
  if (isBrowserOffline()) {
    return { latitude, longitude, address: null, city: null, country: null };
  }
  try {
    const geocoded = await reverseGeocode(latitude, longitude);
    return {
      latitude,
      longitude,
      address: geocoded.address,
      city: geocoded.city,
      country: geocoded.country,
      addressDetails: geocoded.addressDetails ?? null,
    };
  } catch {
    return { latitude, longitude, address: null, city: null, country: null, addressDetails: null };
  }
}

type LocationAccuracy = "fast" | "high";

function buildGeolocationOptions(accuracy: LocationAccuracy): PositionOptions {
  if (accuracy === "fast") {
    // Quick seed — never accept fixes older than 5 seconds.
    return { enableHighAccuracy: false, timeout: 2_000, maximumAge: 5_000 };
  }

  // High-accuracy GPS — no stale cache; wait up to 2s for a fresh fix.
  return { enableHighAccuracy: true, timeout: 2_000, maximumAge: 0 };
}

let nativeLocationPermission: "granted" | "denied" | "prompt" | null = null;

async function ensureNativeLocationPermission(): Promise<"granted" | "denied"> {
  if (nativeLocationPermission === "granted") {
    return "granted";
  }

  if (nativeLocationPermission === "denied") {
    return "denied";
  }

  const { Geolocation } = await import("@capacitor/geolocation");

  try {
    const current = await Geolocation.checkPermissions?.();
    const location = current?.location ?? current?.coarseLocation;

    if (location === "granted") {
      nativeLocationPermission = "granted";
      return "granted";
    }

    if (location === "denied") {
      nativeLocationPermission = "denied";
      return "denied";
    }
  } catch {
    // Fall through to request.
  }

  try {
    const requested = await Geolocation.requestPermissions?.();
    const location = requested?.location ?? requested?.coarseLocation;

    if (location === "granted") {
      nativeLocationPermission = "granted";
      return "granted";
    }

    nativeLocationPermission = "denied";
    return "denied";
  } catch {
    // Older Capacitor builds may lack permission APIs; try getCurrentPosition once.
    return "granted";
  }
}

async function capacitorGetPosition(accuracy: LocationAccuracy): Promise<SpotGeoLocation> {
  const permission = await ensureNativeLocationPermission();

  if (permission === "denied") {
    throw new Error(
      "Location permission denied. Enable Location in Settings to tag this spot."
    );
  }

  const { Geolocation } = await import("@capacitor/geolocation");

  const opts = buildGeolocationOptions(accuracy);
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: opts.enableHighAccuracy,
    timeout: opts.timeout,
    maximumAge: opts.maximumAge,
  });

  const location = await resolveCoordinates(position.coords.latitude, position.coords.longitude);

  return {
    ...location,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    capturedAt: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
    speed:
      typeof position.coords.speed === "number" && position.coords.speed >= 0
        ? position.coords.speed
        : null,
    heading:
      typeof position.coords.heading === "number" && position.coords.heading >= 0
        ? position.coords.heading
        : null,
  };
}

function browserGetPosition(accuracy: LocationAccuracy): Promise<SpotGeoLocation> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Location is not available in this browser."));
      return;
    }

    const opts = buildGeolocationOptions(accuracy);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void resolveCoordinates(position.coords.latitude, position.coords.longitude).then((base) => {
          resolve({
            ...base,
            accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
            capturedAt: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
            speed:
              typeof position.coords.speed === "number" && position.coords.speed >= 0
                ? position.coords.speed
                : null,
            heading:
              typeof position.coords.heading === "number" && position.coords.heading >= 0
                ? position.coords.heading
                : null,
          });
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location permission denied. Allow location to tag this spot."));
          return;
        }

        reject(new Error("Unable to detect your location. Try again outdoors or enable GPS."));
      },
      opts
    );
  });
}

/**
 * Fast, low-accuracy location lookup (≤2 s).
 * Uses cached/network position — perfect for pre-warming before capture.
 * Resolves with coordinates even if reverse geocoding is skipped.
 */
export function requestDeviceLocationFast(): Promise<SpotGeoLocation> {
  if (isCapacitorNative()) {
    return capacitorGetPosition("fast").catch((err: unknown) => {
      return Promise.reject(new Error(err instanceof Error ? err.message : "Unable to detect your location."));
    });
  }

  return browserGetPosition("fast");
}

/**
 * High-accuracy location lookup (≤2 s).
 * Triggers GPS on supported devices — use for refining a previously-cached position.
 */
export function requestDeviceLocation(): Promise<SpotGeoLocation> {
  if (isCapacitorNative()) {
    return capacitorGetPosition("high").catch((err: unknown) => {
      return Promise.reject(new Error(err instanceof Error ? err.message : "Unable to detect your location."));
    });
  }

  return browserGetPosition("high");
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  // Street-level zoom so minor paths are eligible; never trust neighbourhood-level roads.
  url.searchParams.set("zoom", String(NOMINATIM_STREET_ZOOM));
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: NOMINATIM_HEADERS,
  });

  if (!response.ok) {
    throw new Error("Reverse geocoding failed.");
  }

  const data = (await response.json()) as NominatimReversePayload;

  const addressParts = data.address ?? {};
  const city = cityFromNominatimAddress(addressParts);
  const country = addressParts.country ?? null;
  const canonical = canonicalizeGeoLocationFields({ city, country });

  // Store only a confident street (road/path/…) — never full display_name.
  const street = extractConfidentStreetName(data);

  return {
    address: street,
    city: canonical.city,
    country: canonical.country,
    addressDetails: addressParts,
  };
}

/** Forward geocode city/place names (Nominatim). */
export async function searchPlaces(query: string, limit = 6): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: NOMINATIM_HEADERS,
  });

  if (!response.ok) {
    throw new Error("Place search is unavailable. Try again in a moment.");
  }

  const data = (await response.json()) as Array<{
    place_id?: number;
    display_name?: string;
    lat?: string;
    lon?: string;
    address?: Record<string, string | undefined>;
  }>;

  const results: PlaceSearchResult[] = [];

  for (const item of data) {
    const latitude = Number.parseFloat(item.lat ?? "");
    const longitude = Number.parseFloat(item.lon ?? "");

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !item.display_name) {
      continue;
    }

    const address = item.address ?? {};
    const canonical = canonicalizeGeoLocationFields({
      city: cityFromNominatimAddress(address),
      country: address.country ?? null,
    });

    results.push({
      id: String(item.place_id ?? `${latitude}-${longitude}-${results.length}`),
      label: item.display_name,
      latitude,
      longitude,
      city: canonical.city,
      country: canonical.country,
    });
  }

  return results;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
