import { Capacitor } from "@capacitor/core";
import {
  buildGoogleMapsSearchWebUrl,
  buildExternalMapsUrl,
} from "@/lib/externalMaps";
import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";
import { isIOSDevice } from "@/lib/pickMediaFromGallery";
import { mapboxStaticPlaceImageUrl } from "@/lib/placeImages";
import type { CityRoomPlacePayload } from "@/lib/cityRoomPlaceMessage";
import {
  formatSpotGeoLocationShortLabel,
  inferSpotRegionFromAddress,
} from "@/lib/spotLocationDisplay";
import type { SpotGeoLocation } from "@/lib/spotLocation";

export function buildMapPlaceDeepLink(
  latitude: number,
  longitude: number,
  placeName?: string | null
) {
  const params = new URLSearchParams({
    tab: "map",
    lat: String(latitude),
    lng: String(longitude),
  });

  const name = placeName?.trim();

  if (name) {
    params.set("place", name);
  }

  return `/visit?${params.toString()}`;
}

/**
 * Always returns a real `https://` URL — never `capacitor://localhost/...`.
 * `window.location.origin` inside the iOS WKWebView is a custom scheme, and
 * passing that to `navigator.share()` / `UIActivityViewController` makes the
 * recipient's link unopenable and can make WebKit reject `share()` outright
 * with a bare `TypeError` ("Type error") because the URL scheme isn't
 * http(s). getHostedApiBaseUrl() already knows the production web origin.
 */
export function buildMapPlaceShareUrl(
  latitude: number,
  longitude: number,
  placeName?: string | null
) {
  const path = buildMapPlaceDeepLink(latitude, longitude, placeName);
  const base = getHostedApiBaseUrl().replace(/\/$/, "");

  return `${base}${path}`;
}

export function geoLocationToMapPlaceSharePayload(
  location: SpotGeoLocation,
  options?: { name?: string | null; locale?: import("@/lib/i18n/locales").I18nLocale }
): CityRoomPlacePayload {
  const fallbackName = formatSpotGeoLocationShortLabel(
    location,
    options?.locale ?? "en"
  );
  const name =
    options?.name?.trim() ||
    location.address?.split(",").map((part) => part.trim()).find(Boolean) ||
    fallbackName;
  const address =
    location.address?.trim() ||
    [location.city, location.country].filter(Boolean).join(", ") ||
    `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  const region = inferSpotRegionFromAddress({
    address: location.address,
    city: location.city,
    country: location.country,
  });

  return {
    name,
    address,
    description: null,
    imageUrl: mapboxStaticPlaceImageUrl(location.latitude, location.longitude),
    latitude: location.latitude,
    longitude: location.longitude,
    city: location.city,
    country: location.country,
    region,
  };
}

export function buildExternalMapPlaceShareText(
  place: CityRoomPlacePayload,
  shareUrl: string
) {
  const lines = [
    place.name,
    place.address,
    `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`,
    "",
    `Open in SpotDrop: ${shareUrl}`,
    `Google Maps: ${buildGoogleMapsSearchWebUrl(place.latitude, place.longitude)}`,
  ];

  if (isIOSDevice()) {
    lines.push(
      `Apple Maps: ${buildExternalMapsUrl(place.latitude, place.longitude, place.name)}`
    );
  }

  return lines.join("\n");
}

/** Strictly-typed, share()-safe payload: three plain strings, nothing else. */
type MapPlaceSharePayload = {
  title: string;
  text: string;
  url: string;
};

class MapPlaceShareValidationError extends Error {
  constructor(message: string, public readonly payload: unknown) {
    super(message);
    this.name = "MapPlaceShareValidationError";
  }
}

/**
 * Builds the exact payload passed to the share call and validates every
 * field is a plain, non-empty string — never null/undefined/objects/arrays.
 * Coordinates are only ever interpolated into `text`, never passed raw.
 */
export function buildMapPlaceSharePayload(place: CityRoomPlacePayload): MapPlaceSharePayload {
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new MapPlaceShareValidationError(
      "Invalid coordinates for this place.",
      { latitude: place.latitude, longitude: place.longitude }
    );
  }

  const shareUrl = buildMapPlaceShareUrl(latitude, longitude, place.name);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(shareUrl);
  } catch (parseError) {
    throw new MapPlaceShareValidationError(
      `Share URL failed to parse: ${String(parseError)}`,
      { shareUrl }
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new MapPlaceShareValidationError(
      `Share URL has an unsupported scheme "${parsedUrl.protocol}" — must be http(s).`,
      { shareUrl }
    );
  }

  const title = (place.name ?? "").trim() || "SpotDrop place";
  const text = buildExternalMapPlaceShareText(place, shareUrl);

  const payload: MapPlaceSharePayload = {
    title,
    text,
    url: parsedUrl.toString(),
  };

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new MapPlaceShareValidationError(
        `Share payload field "${key}" must be a non-empty string.`,
        payload
      );
    }
  }

  return payload;
}

export type MapPlaceShareDebugInfo = {
  platform: string;
  usedApi: "capacitor-share" | "navigator.share" | "clipboard-fallback" | "none";
  payload: MapPlaceSharePayload | null;
};

export type MapPlaceShareResult = {
  ok: boolean;
  cancelled: boolean;
  debug: MapPlaceShareDebugInfo;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

function describeError(caught: unknown) {
  if (caught instanceof Error) {
    return { name: caught.name, message: caught.message, stack: caught.stack };
  }

  return { name: "UnknownError", message: String(caught), stack: undefined };
}

/**
 * Shares a map place using the platform-correct API:
 * - Capacitor native (iOS/Android): `@capacitor/share` → `UIActivityViewController` /
 *   Android share intent. This avoids WKWebView's stricter Web Share API
 *   validation entirely.
 * - Web: `navigator.share()` when available.
 * On any non-cancel failure, falls back to copying "text + url" to the
 * clipboard so the user always has something they can paste manually.
 * Every branch logs platform, API used, payload, and full error details.
 */
export async function shareMapPlaceExternally(
  place: CityRoomPlacePayload
): Promise<MapPlaceShareResult> {
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  let payload: MapPlaceSharePayload;

  try {
    payload = buildMapPlaceSharePayload(place);
  } catch (validationError) {
    const error = describeError(validationError);
    console.error("[map-place-share] payload validation failed", {
      platform,
      isNative,
      place,
      error,
    });

    return {
      ok: false,
      cancelled: false,
      debug: { platform, usedApi: "none", payload: null },
      error,
    };
  }

  console.log("[map-place-share] attempting share", {
    platform,
    isNative,
    payload,
  });

  if (isNative) {
    try {
      const { Share } = await import("@capacitor/share");

      await Share.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
        dialogTitle: payload.title,
      });

      console.log("[map-place-share] capacitor Share.share() succeeded", { platform, payload });

      return {
        ok: true,
        cancelled: false,
        debug: { platform, usedApi: "capacitor-share", payload },
      };
    } catch (shareError) {
      const error = describeError(shareError);
      const cancelled =
        error.message?.toLowerCase().includes("cancel") ||
        error.message?.toLowerCase().includes("abort");

      console.error("[map-place-share] capacitor Share.share() failed", {
        platform,
        payload,
        error,
        cancelled,
      });

      if (cancelled) {
        return {
          ok: false,
          cancelled: true,
          debug: { platform, usedApi: "capacitor-share", payload },
          error,
        };
      }

      return await fallbackCopyToClipboard(platform, payload, error);
    }
  }

  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    console.warn("[map-place-share] navigator.share unavailable on web", { platform, payload });
    return await fallbackCopyToClipboard(platform, payload, {
      name: "NotSupportedError",
      message: "Web Share API is not available in this browser.",
    });
  }

  try {
    await navigator.share({
      title: payload.title,
      text: payload.text,
      url: payload.url,
    });

    console.log("[map-place-share] navigator.share() succeeded", { platform, payload });

    return {
      ok: true,
      cancelled: false,
      debug: { platform, usedApi: "navigator.share", payload },
    };
  } catch (shareError) {
    const error = describeError(shareError);
    const cancelled = error.name === "AbortError";

    console.error("[map-place-share] navigator.share() failed", {
      platform,
      payload,
      error,
      cancelled,
    });

    if (cancelled) {
      return {
        ok: false,
        cancelled: true,
        debug: { platform, usedApi: "navigator.share", payload },
        error,
      };
    }

    return await fallbackCopyToClipboard(platform, payload, error);
  }
}

async function fallbackCopyToClipboard(
  platform: string,
  payload: MapPlaceSharePayload,
  error: { name: string; message: string; stack?: string }
): Promise<MapPlaceShareResult> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable.");
    }

    await navigator.clipboard.writeText(`${payload.text}`);

    console.warn("[map-place-share] share failed — copied fallback text to clipboard", {
      platform,
      payload,
      originalError: error,
    });

    return {
      ok: false,
      cancelled: false,
      debug: { platform, usedApi: "clipboard-fallback", payload },
      error,
    };
  } catch (clipboardError) {
    const clipboardErrorDetails = describeError(clipboardError);

    console.error("[map-place-share] clipboard fallback also failed", {
      platform,
      payload,
      originalError: error,
      clipboardError: clipboardErrorDetails,
    });

    return {
      ok: false,
      cancelled: false,
      debug: { platform, usedApi: "none", payload },
      error,
    };
  }
}

export function canNativeShareMapPlace() {
  if (typeof window === "undefined") {
    return false;
  }

  if (Capacitor.isNativePlatform()) {
    return true;
  }

  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}
