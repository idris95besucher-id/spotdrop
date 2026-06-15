import { readGpsFromMediaFile } from "@/lib/spotExif";
import { spotLocationFromCoordinates, type SpotGeoLocation } from "@/lib/spotLocation";

/** Reverse-geocode GPS embedded in a photo or video file. Returns null if no GPS metadata. */
export async function spotLocationFromMediaFile(file: File): Promise<SpotGeoLocation | null> {
  const gps = await readGpsFromMediaFile(file);

  if (!gps) {
    return null;
  }

  return spotLocationFromCoordinates(gps.latitude, gps.longitude);
}
