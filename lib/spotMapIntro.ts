import { canonicalizeSpotLocationFields } from "@/lib/i18n/canonicalGeo";
import { isSpotContent } from "@/lib/spotLocationDisplay";

export type SpotMapIntroTarget = {
  content_kind?: string | null;
  spot_latitude?: number | null;
  spot_longitude?: number | null;
  spot_city?: string | null;
  spot_country?: string | null;
  spot_name?: string | null;
  visibility?: "public" | "private" | null;
};

export type SpotMapIntroWaypoint = {
  label: string;
  center: [number, number];
  zoom: number;
  durationMs: number;
};

const EUROPE_WAYPOINT: SpotMapIntroWaypoint = {
  label: "Europe",
  center: [15, 50],
  zoom: 3.8,
  durationMs: 2_200,
};

const COUNTRY_CENTERS: Record<string, SpotMapIntroWaypoint> = {
  Switzerland: {
    label: "Switzerland",
    center: [8.2275, 46.8182],
    zoom: 6.8,
    durationMs: 2_400,
  },
  Germany: {
    label: "Germany",
    center: [10.4515, 51.1657],
    zoom: 5.8,
    durationMs: 2_400,
  },
  France: {
    label: "France",
    center: [2.2137, 46.2276],
    zoom: 5.8,
    durationMs: 2_400,
  },
  Italy: {
    label: "Italy",
    center: [12.5674, 41.8719],
    zoom: 5.8,
    durationMs: 2_400,
  },
  Austria: {
    label: "Austria",
    center: [14.5501, 47.5162],
    zoom: 6.5,
    durationMs: 2_400,
  },
};

const CITY_CENTERS: Record<string, [number, number]> = {
  bern: [7.4474, 46.948],
  berne: [7.4474, 46.948],
  zurich: [8.5417, 47.3769],
  zürich: [8.5417, 47.3769],
  geneva: [6.1432, 46.2044],
  genève: [6.1432, 46.2044],
  basel: [7.5886, 47.5596],
  lausanne: [6.6323, 46.5197],
  lucerne: [8.3093, 47.0502],
  luzern: [8.3093, 47.0502],
  interlaken: [7.8632, 46.6863],
  thun: [7.6281, 46.758],
  biel: [7.2468, 47.1368],
  fribourg: [7.1531, 46.8065],
  "st. moritz": [9.8355, 46.4908],
  lugano: [8.9511, 46.0037],
};

const SESSION_KEY_PREFIX = "spot-map-intro-v1:";
const seenSpotIds = new Set<string>();
let lastIntroPlayedAt = 0;

/** Minimum gap between intros when swiping through spots. */
export const SPOT_MAP_INTRO_SWIPE_GAP_MS = 60_000;

export const SPOT_MAP_INTRO_LOAD_TIMEOUT_MS = 3_000;

export function shouldPlaySpotMapIntro(
  spot: SpotMapIntroTarget,
  mediaType: "image" | "video" | null
): boolean {
  if (mediaType !== "video") {
    return false;
  }

  if (
    !isSpotContent({
      content_kind: spot.content_kind,
      spot_latitude: spot.spot_latitude,
      spot_longitude: spot.spot_longitude,
    })
  ) {
    return false;
  }

  if (spot.visibility === "private") {
    return false;
  }

  const latitude = Number(spot.spot_latitude);
  const longitude = Number(spot.spot_longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function readSessionSeen(spotId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${spotId}`) != null;
  } catch {
    return false;
  }
}

export function shouldSkipSpotMapIntroCached(spotId: string): boolean {
  if (seenSpotIds.has(spotId) || readSessionSeen(spotId)) {
    return true;
  }

  if (lastIntroPlayedAt > 0 && Date.now() - lastIntroPlayedAt < SPOT_MAP_INTRO_SWIPE_GAP_MS) {
    return true;
  }

  return false;
}

export function markSpotMapIntroPlayed(spotId: string) {
  seenSpotIds.add(spotId);
  lastIntroPlayedAt = Date.now();

  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${spotId}`, String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}

function normalizeCityKey(city: string | null | undefined) {
  return city?.trim().toLowerCase() ?? "";
}

function resolveCountryWaypoint(country: string | null | undefined): SpotMapIntroWaypoint {
  const { countryNameEn } = canonicalizeSpotLocationFields({ spot_country: country });
  const canonical = countryNameEn ?? "Switzerland";

  return (
    COUNTRY_CENTERS[canonical] ?? {
      label: canonical,
      center: COUNTRY_CENTERS.Switzerland.center,
      zoom: 6.2,
      durationMs: 2_400,
    }
  );
}

function resolveCityWaypoint(
  city: string | null | undefined,
  country: string | null | undefined
): SpotMapIntroWaypoint | null {
  const { cityNameEn, countryNameEn } = canonicalizeSpotLocationFields({
    spot_city: city,
    spot_country: country,
  });

  const candidates = [cityNameEn, city].map(normalizeCityKey).filter(Boolean);

  for (const key of candidates) {
    const center = CITY_CENTERS[key];

    if (center) {
      return {
        label: cityNameEn ?? city?.trim() ?? "City",
        center,
        zoom: 11.2,
        durationMs: 2_200,
      };
    }
  }

  return null;
}

export function buildSpotMapIntroWaypoints(spot: SpotMapIntroTarget): SpotMapIntroWaypoint[] {
  const latitude = Number(spot.spot_latitude);
  const longitude = Number(spot.spot_longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return [];
  }

  const country = resolveCountryWaypoint(spot.spot_country);
  const city = resolveCityWaypoint(spot.spot_city, spot.spot_country);
  const spotLabel = spot.spot_name?.trim() || city?.label || country.label;

  const waypoints: SpotMapIntroWaypoint[] = [EUROPE_WAYPOINT, country];

  if (city) {
    waypoints.push(city);
  }

  waypoints.push({
    label: spotLabel,
    center: [longitude, latitude],
    zoom: 15.6,
    durationMs: 2_600,
  });

  return waypoints;
}

export function resolveInitialMapIntroWaypoint(waypoints: SpotMapIntroWaypoint[]): SpotMapIntroWaypoint {
  return waypoints[0] ?? EUROPE_WAYPOINT;
}
