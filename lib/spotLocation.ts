export const SPOT_MAX_VIDEO_SECONDS = 60;

export type SpotGeoLocation = {
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  country: string | null;
};

export type ReverseGeocodeResult = {
  address: string | null;
  city: string | null;
  country: string | null;
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
  try {
    const geocoded = await reverseGeocode(latitude, longitude);

    return {
      latitude,
      longitude,
      address: geocoded.address,
      city: geocoded.city,
      country: geocoded.country,
    };
  } catch {
    return {
      latitude,
      longitude,
      address: null,
      city: null,
      country: null,
    };
  }
}

export function formatSpotLocationLabel(location: SpotGeoLocation) {
  const parts = [location.address, location.city, location.country].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

export function requestDeviceLocation(): Promise<SpotGeoLocation> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Location is not available in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        if (isBrowserOffline()) {
          resolve({
            latitude,
            longitude,
            address: null,
            city: null,
            country: null,
          });
          return;
        }

        try {
          const geocoded = await reverseGeocode(latitude, longitude);

          resolve({
            latitude,
            longitude,
            address: geocoded.address,
            city: geocoded.city,
            country: geocoded.country,
          });
        } catch {
          resolve({
            latitude,
            longitude,
            address: null,
            city: null,
            country: null,
          });
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location permission denied. Allow location to tag this spot."));
          return;
        }

        reject(new Error("Unable to detect your location. Try again outdoors or enable GPS."));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 60000,
      }
    );
  });
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Reverse geocoding failed.");
  }

  const data = (await response.json()) as {
    display_name?: string;
    address?: Record<string, string | undefined>;
  };

  const addressParts = data.address ?? {};
  const city = cityFromNominatimAddress(addressParts);
  const country = addressParts.country ?? null;

  return {
    address: data.display_name ?? null,
    city,
    country,
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

    results.push({
      id: String(item.place_id ?? `${latitude}-${longitude}-${results.length}`),
      label: item.display_name,
      latitude,
      longitude,
      city: cityFromNominatimAddress(address),
      country: address.country ?? null,
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
