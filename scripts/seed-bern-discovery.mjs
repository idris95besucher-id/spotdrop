import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REGION = {
  country_slug: "switzerland",
  slug: "bern-area",
  name: "Bern & Oberland",
  city_slug: "bern",
  map_bounds_north: 47.02,
  map_bounds_south: 46.45,
  map_bounds_east: 8.05,
  map_bounds_west: 7.35,
};

const PLACES = [
  {
    slug: "blausee",
    name: "Blausee",
    category: "lakes",
    latitude: 46.535,
    longitude: 7.693,
    short_description: "Crystal-clear alpine lake in Kandergrund.",
    official_summary:
      "Blausee is a small, intensely blue lake in the Bernese Oberland. Walk the forest loop, rent a rowboat in season, and visit early for calm water and fewer crowds.",
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
      "Use Interlaken as your base for Jungfrau trips. Höheweg is ideal for cafés and evening strolls; combine with a lake cruise or Harder Kulm for views.",
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
      "Thun mixes castle views, river walks, and lake cruises. Explore the old town lanes, then take a boat toward Spiez on a clear afternoon.",
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
      "Ride the Gurten funicular from Wabern for sunset views over Bern and the Alps. Bring a jacket; the summit breeze is cooler than in the old town.",
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
      "Oeschinensee rewards hikers with one of Switzerland's most dramatic lake settings. Take the cable car from Kandersteg, then walk to the shore for the classic photo angle.",
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
      "Lauterbrunnen is the valley hub for Staubbach Falls, Trümmelbach, and lifts to car-free mountain villages. Plan a full day if you combine valley walks with a summit trip.",
    hero_image_url: null,
    official_url: "https://www.myswitzerland.com/en/destinations/lauterbrunnen/",
    sort_order: 60,
  },
];

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upsertRegion() {
  const { data: existing } = await supabase
    .from("discovery_regions")
    .select("id")
    .eq("country_slug", REGION.country_slug)
    .eq("slug", REGION.slug)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("discovery_regions").update(REGION).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase.from("discovery_regions").insert(REGION).select("id").single();
  if (error) throw error;
  return data.id;
}

async function upsertPlace(regionId, placeRow) {
  const { data: existing } = await supabase
    .from("discovery_places")
    .select("id")
    .eq("region_id", regionId)
    .eq("slug", placeRow.slug)
    .maybeSingle();

  let placeId = existing?.id;

  if (placeId) {
    const { error } = await supabase.from("discovery_places").update(placeRow).eq("id", placeId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("discovery_places")
      .insert({ ...placeRow, region_id: regionId })
      .select("id")
      .single();
    if (error) throw error;
    placeId = data.id;
  }

  return placeId;
}

async function main() {
  const regionId = await upsertRegion();
  console.log(`Region ready: ${REGION.slug} (${regionId})`);

  for (const place of PLACES) {
    const placeId = await upsertPlace(regionId, place);
    console.log(`Place ready: ${place.name} (${placeId})`);
  }

  console.log("Bern discovery map seed complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
