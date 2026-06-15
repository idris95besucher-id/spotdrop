import exifr from "exifr";

export type MediaGpsCoordinates = {
  latitude: number;
  longitude: number;
};

function isValidGpsPair(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function toGpsPair(latitude: unknown, longitude: unknown): MediaGpsCoordinates | null {
  if (!isValidGpsPair(latitude, longitude) || typeof longitude !== "number") {
    return null;
  }

  return { latitude, longitude };
}

function nestedCoord(value: unknown, key: "latitude" | "longitude"): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
}

function gpsFromRecord(record: Record<string, unknown>): MediaGpsCoordinates | null {
  const latitude =
    record.latitude ??
    record.GPSLatitude ??
    record.lat ??
    nestedCoord(record.location, "latitude") ??
    nestedCoord(record.Location, "latitude");

  const longitude =
    record.longitude ??
    record.GPSLongitude ??
    record.lon ??
    record.lng ??
    nestedCoord(record.location, "longitude") ??
    nestedCoord(record.Location, "longitude");

  return toGpsPair(latitude, longitude);
}

/** Apple QuickTime / ISO 6709, e.g. +46.9481+007.4474/ */
function parseIso6709Location(value: string): MediaGpsCoordinates | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  return toGpsPair(Number.parseFloat(match[1]!), Number.parseFloat(match[2]!));
}

function gpsFromQuickTimeTags(tags: Record<string, unknown>): MediaGpsCoordinates | null {
  const isoKeys = [
    "com.apple.quicktime.location.ISO6709",
    "location.ISO6709",
    "Location.ISO6709",
  ];

  for (const key of isoKeys) {
    const raw = tags[key];

    if (typeof raw === "string") {
      const parsed = parseIso6709Location(raw);

      if (parsed) {
        return parsed;
      }
    }
  }

  return gpsFromRecord(tags);
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || /\.(mov|mp4|m4v|webm|qt)$/i.test(file.name);
}

/**
 * Reads only GPS coordinates from media metadata. Does not return other EXIF fields.
 */
export async function readGpsFromMediaFile(file: File): Promise<MediaGpsCoordinates | null> {
  try {
    const gps = await exifr.gps(file);
    const gpsPair = gps ? toGpsPair(gps.latitude, gps.longitude) : null;

    if (gpsPair) {
      return gpsPair;
    }
  } catch {
    // Fall through.
  }

  try {
    const tags = await exifr.parse(file, {
      gps: true,
      pick: ["latitude", "longitude", "GPSLatitude", "GPSLongitude", "Location"],
    });

    if (tags && typeof tags === "object") {
      const pair = gpsFromRecord(tags as Record<string, unknown>);

      if (pair) {
        return pair;
      }
    }
  } catch {
    // Fall through.
  }

  if (!isVideoFile(file)) {
    return null;
  }

  try {
    const tags = await exifr.parse(file, {
      gps: true,
      mergeOutput: true,
    });

    if (tags && typeof tags === "object") {
      const pair = gpsFromRecord(tags as Record<string, unknown>);

      if (pair) {
        return pair;
      }
    }
  } catch {
    // Fall through.
  }

  try {
    const tags = await exifr.parse(file, {
      translateKeys: false,
      mergeOutput: true,
    });

    if (tags && typeof tags === "object") {
      const pair = gpsFromQuickTimeTags(tags as Record<string, unknown>);

      if (pair) {
        return pair;
      }
    }
  } catch {
    return null;
  }

  return null;
}
