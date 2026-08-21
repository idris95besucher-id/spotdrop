import { Capacitor } from "@capacitor/core";
import { isIOSDevice } from "@/lib/pickMediaFromGallery";

export function buildGoogleMapsSearchWebUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export function buildGoogleMapsQueryWebUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function isAndroidDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (Capacitor.getPlatform() === "android") {
      return true;
    }
  } catch {
    // Fall through to UA detection.
  }

  return /Android/i.test(navigator.userAgent);
}

export function buildExternalMapsUrl(latitude: number, longitude: number, label?: string | null) {
  const name = label?.trim() || "Location";

  if (isIOSDevice()) {
    return `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(name)}`;
  }

  return buildGoogleMapsSearchWebUrl(latitude, longitude);
}

/**
 * Open Google Maps at exact coordinates.
 * iOS: comgooglemaps:// when installed, else Google Maps web.
 * Android: geo: intent when available, else Google Maps web.
 * Web: Google Maps search URL.
 */
export function openGoogleMapsAtCoordinates(latitude: number, longitude: number) {
  if (typeof window === "undefined") {
    return;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return;
  }

  const webUrl = buildGoogleMapsSearchWebUrl(lat, lng);

  if (isIOSDevice()) {
    const appUrl = `comgooglemaps://?q=${lat},${lng}`;
    const startedAt = Date.now();
    window.location.href = appUrl;

    window.setTimeout(() => {
      if (Date.now() - startedAt < 1600) {
        window.location.href = webUrl;
      }
    }, 700);
    return;
  }

  if (isAndroidDevice()) {
    const encodedWeb = encodeURIComponent(webUrl);
    const intentUrl = `intent://maps.google.com/maps?q=${lat},${lng}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodedWeb};end`;
    const startedAt = Date.now();
    window.location.href = intentUrl;

    window.setTimeout(() => {
      if (Date.now() - startedAt < 1600) {
        window.location.href = webUrl;
      }
    }, 700);
    return;
  }

  window.open(webUrl, "_blank", "noopener,noreferrer");
}

/**
 * Opens Google Maps for a free-text address/place query — used only when no
 * coordinates are available. Same app-scheme-then-web-fallback behavior as
 * {@link openGoogleMapsAtCoordinates}.
 */
export function openGoogleMapsAtQuery(query: string) {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = query.trim();

  if (!trimmed) {
    return;
  }

  const webUrl = buildGoogleMapsQueryWebUrl(trimmed);

  if (isIOSDevice()) {
    const appUrl = `comgooglemaps://?q=${encodeURIComponent(trimmed)}`;
    const startedAt = Date.now();
    window.location.href = appUrl;

    window.setTimeout(() => {
      if (Date.now() - startedAt < 1600) {
        window.location.href = webUrl;
      }
    }, 700);
    return;
  }

  if (isAndroidDevice()) {
    const encodedWeb = encodeURIComponent(webUrl);
    const intentUrl = `intent://maps.google.com/maps?q=${encodeURIComponent(trimmed)}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodedWeb};end`;
    const startedAt = Date.now();
    window.location.href = intentUrl;

    window.setTimeout(() => {
      if (Date.now() - startedAt < 1600) {
        window.location.href = webUrl;
      }
    }, 700);
    return;
  }

  window.open(webUrl, "_blank", "noopener,noreferrer");
}

