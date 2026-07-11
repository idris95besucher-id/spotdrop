import { isIOSDevice } from "@/lib/pickMediaFromGallery";

export function buildExternalMapsUrl(latitude: number, longitude: number, label?: string | null) {
  const name = label?.trim() || "Location";

  if (isIOSDevice()) {
    return `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(name)}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/**
 * Google Maps directions only (never Apple Maps / system chooser).
 * Uses exact destination coordinates — not a cached address or the user's GPS.
 */
export function buildExternalMapsDirectionsUrl(latitude: number, longitude: number, _label?: string | null) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  // comgooglemaps URL scheme opens the Google Maps app when installed on iOS.
  // Fallback https URL opens Google Maps in the browser.
  if (isIOSDevice()) {
    return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function openExternalMapsDirections(latitude: number, longitude: number, label?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const appUrl = buildExternalMapsDirectionsUrl(lat, lng, label);
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  if (isIOSDevice()) {
    // Try the Google Maps app first; fall back to browser if the scheme is unavailable.
    const startedAt = Date.now();
    window.location.href = appUrl;

    window.setTimeout(() => {
      if (Date.now() - startedAt < 1600) {
        window.location.href = webUrl;
      }
    }, 700);
    return;
  }

  window.location.assign(webUrl);
}
