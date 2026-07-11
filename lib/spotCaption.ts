import { hasLocationCardContentMarker } from "@/lib/spotLocationCard";

export const SPOT_CAPTION_MAX_LENGTH = 500;

export function normalizeSpotCaption(value: string): string {
  return value.slice(0, SPOT_CAPTION_MAX_LENGTH);
}

/** User-written caption — excludes location-card marker content. */
export function getSpotCaption(content: string | null | undefined): string | null {
  const trimmed = content?.trim() ?? "";

  if (!trimmed || hasLocationCardContentMarker(trimmed)) {
    return null;
  }

  return trimmed;
}
