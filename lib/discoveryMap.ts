export type DiscoveryPlaceCategory = "lakes" | "mountains" | "villages" | "viewpoints" | "hiking";

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type DiscoveryRegion = {
  id: string;
  country_slug: string;
  slug: string;
  name: string;
  city_slug: string | null;
  map_bounds_north: number;
  map_bounds_south: number;
  map_bounds_east: number;
  map_bounds_west: number;
};

export type DiscoveryPlace = {
  id: string;
  region_id: string;
  slug: string;
  name: string;
  category: DiscoveryPlaceCategory;
  latitude: number;
  longitude: number;
  short_description: string | null;
  official_summary: string | null;
  hero_image_url: string | null;
  official_url: string | null;
  sort_order: number;
};

export const BERN_DISCOVERY_REGION_SLUG = "bern-area";

export const BERN_MAP_BOUNDS: MapBounds = {
  north: 47.02,
  south: 46.45,
  east: 8.05,
  west: 7.35,
};

export const DISCOVERY_CATEGORY_LABELS: Record<DiscoveryPlaceCategory, string> = {
  lakes: "Lakes",
  mountains: "Mountains",
  villages: "Villages",
  viewpoints: "Viewpoints",
  hiking: "Hiking",
};

export const DISCOVERY_CATEGORY_COLORS: Record<DiscoveryPlaceCategory, string> = {
  lakes: "bg-sky-400",
  mountains: "bg-violet-400",
  villages: "bg-amber-400",
  viewpoints: "bg-rose-400",
  hiking: "bg-emerald-400",
};

/** Static fallback when DB migration is not applied yet. */
export const BERN_DISCOVERY_PLACES_FALLBACK: Omit<DiscoveryPlace, "id" | "region_id">[] = [
  {
    slug: "blausee",
    name: "Blausee",
    category: "lakes",
    latitude: 46.535,
    longitude: 7.693,
    short_description: "Crystal-clear alpine lake in Kandergrund.",
    official_summary:
      "Official Swiss Guide: Blausee is a small, intensely blue lake in the Bernese Oberland. Walk the forest loop, rent a rowboat in season, and visit early for calm water and fewer crowds.",
    hero_image_url: "/guide-places/blausee.svg",
    official_url: "https://www.blausee.ch/",
    sort_order: 10,
  },
  {
    slug: "interlaken",
    name: "Interlaken",
    category: "villages",
    latitude: 46.686,
    longitude: 7.863,
    short_description: "Gateway town between Lake Thun and Lake Brienz.",
    official_summary:
      "Official Swiss Guide: Use Interlaken as your base for Jungfrau trips. Höheweg is ideal for cafés and evening strolls; combine with a lake cruise or Harder Kulm for views.",
    hero_image_url: null,
    official_url: "https://www.interlaken.ch/",
    sort_order: 20,
  },
  {
    slug: "thun",
    name: "Thun",
    category: "villages",
    latitude: 46.759,
    longitude: 7.628,
    short_description: "Lakeside old town at the gateway to the Bernese Oberland.",
    official_summary:
      "Official Swiss Guide: Thun mixes castle views, river walks, and lake cruises. Explore the old town lanes, then take a boat toward Spiez on a clear afternoon.",
    hero_image_url: null,
    official_url: "https://www.thunersee.ch/",
    sort_order: 30,
  },
  {
    slug: "gurten",
    name: "Gurten",
    category: "viewpoints",
    latitude: 46.853,
    longitude: 7.507,
    short_description: "Bern's local mountain with panorama over the capital.",
    official_summary:
      "Official Swiss Guide: Ride the Gurten funicular from Wabern for sunset views over Bern and the Alps. Bring a jacket; the summit breeze is cooler than in the old town.",
    hero_image_url: null,
    official_url: "https://www.gurtenpark.ch/",
    sort_order: 40,
  },
  {
    slug: "oeschinensee",
    name: "Oeschinensee",
    category: "lakes",
    latitude: 46.498,
    longitude: 7.727,
    short_description: "Turquoise alpine lake beneath the Blüemlisalp massif.",
    official_summary:
      "Official Swiss Guide: Oeschinensee rewards hikers with one of Switzerland's most dramatic lake settings. Take the cable car from Kandersteg, then walk to the shore for the classic photo angle.",
    hero_image_url: null,
    official_url: "https://www.oeschinensee.ch/",
    sort_order: 50,
  },
  {
    slug: "lauterbrunnen",
    name: "Lauterbrunnen",
    category: "hiking",
    latitude: 46.592,
    longitude: 7.91,
    short_description: "Valley of 72 waterfalls and trailheads to Mürren and Wengen.",
    official_summary:
      "Official Swiss Guide: Lauterbrunnen is the valley hub for Staubbach Falls, Trümmelbach, and lifts to car-free mountain villages. Plan a full day if you combine valley walks with a summit trip.",
    hero_image_url: null,
    official_url: "https://www.myswitzerland.com/en/destinations/lauterbrunnen/",
    sort_order: 60,
  },
];

export function projectLatLngToPercent(lat: number, lng: number, bounds: MapBounds) {
  const x = ((lng - bounds.west) / (bounds.east - bounds.west)) * 100;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * 100;

  return {
    x: Math.min(96, Math.max(4, x)),
    y: Math.min(94, Math.max(6, y)),
  };
}

export function isBernDiscoveryRoom(
  countrySlug: string,
  citySlug: string,
  cityName?: string | null
) {
  const country = countrySlug.toLowerCase();
  const city = citySlug.toLowerCase();
  const name = cityName?.trim().toLowerCase() ?? "";

  const isSwissCountry =
    country === "switzerland" || country === "ch" || country === "schweiz" || country === "suisse";
  const isBernCity = city === "bern" || name === "bern";

  return isSwissCountry && isBernCity;
}

/** Instant Bern places for first paint (no async wait). */
export function getBernDiscoveryPlacesInstant(): DiscoveryPlace[] {
  return BERN_DISCOVERY_PLACES_FALLBACK.map((place, index) => ({
    ...place,
    id: `fallback-${place.slug}`,
    region_id: "fallback-region",
    sort_order: place.sort_order || (index + 1) * 10,
  }));
}

export function isDiscoveryRelationMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST200" ||
    message.includes("discovery_places") ||
    message.includes("discovery_regions") ||
    message.includes("discovery_place")
  );
}
