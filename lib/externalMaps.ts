import { isIOSDevice } from "@/lib/pickMediaFromGallery";

export function buildExternalMapsUrl(latitude: number, longitude: number, label?: string | null) {
  const name = label?.trim() || "Location";

  if (isIOSDevice()) {
    return `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(name)}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
