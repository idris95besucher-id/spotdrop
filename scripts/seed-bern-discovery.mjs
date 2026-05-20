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
const guideEmail = process.env.SPOTDROP_BERN_GUIDE_EMAIL || "bern_guide@spotdrop.local";

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
      "Official Swiss Guide: Blausee is a small, intensely blue lake in the Bernese Oberland. Walk the forest loop, rent a rowboat in season, and visit early for calm water and fewer crowds.",
    hero_image_url: "/guide-places/blausee.svg",
    official_url: "https://www.blausee.ch/",
    sort_order: 10,
    guide_post:
      "Official AI Guide: Blausee is one of the easiest lake day trips from Bern. Combine the short forest walk with a café stop in Kandergrund and check boat rental times before you go.",
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
    guide_post:
      "Official AI Guide: Interlaken works best as a hub—lake cruise in the morning, Harder Kulm before sunset, and Jungfrau trains on a separate clear-weather day.",
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
    guide_post:
      "Official AI Guide: Thun is a strong half-day from Bern—castle quarter first, then walk the river promenade and grab a lake cruise if the weather is clear.",
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
    guide_post:
      "Official AI Guide: Gurten is the quick nature escape above Bern. Funicular up, short summit loop, and aim for golden hour when the old town lights start to glow.",
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
    guide_post:
      "Official AI Guide: Oeschinensee is worth the cable car plus lakeside walk. Wear sturdy shoes, pack a wind layer, and start earlier on summer weekends.",
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
    guide_post:
      "Official AI Guide: Lauterbrunnen is the classic waterfall valley day. See Staubbach Falls first, add Trümmelbach if you want an indoor gorge option, then lift up to Mürren or Wengen if you have time.",
  },
];

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findGuideUserId() {
  const { data: profile } = await supabase.from("profiles").select("id").eq("username", "bern_guide").maybeSingle();

  if (profile?.id) {
    return profile.id;
  }

  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === guideEmail.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

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

async function upsertPlace(regionId, place) {
  const { guide_post, ...placeRow } = place;

  const { data: existing } = await supabase
    .from("discovery_places")
    .select("id")
    .eq("region_id", regionId)
    .eq("slug", place.slug)
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

  return { placeId, guide_post };
}

async function ensureGuidePost(guideUserId, placeId, guidePost) {
  const { data: existing } = await supabase
    .from("posts")
    .select("id")
    .eq("discovery_place_id", placeId)
    .eq("user_id", guideUserId)
    .eq("content_kind", "post")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("posts").update({ content: guidePost }).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: guideUserId,
      content: guidePost,
      visibility: "public",
      discovery_place_id: placeId,
      content_kind: "post",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function main() {
  const guideUserId = await findGuideUserId();

  if (!guideUserId) {
    console.error("bern_guide user not found. Run npm run seed:bern-guide first.");
    process.exit(1);
  }

  const regionId = await upsertRegion();
  console.log(`Region ready: ${REGION.slug} (${regionId})`);

  for (const place of PLACES) {
    const { placeId, guide_post } = await upsertPlace(regionId, place);
    await ensureGuidePost(guideUserId, placeId, guide_post);
    console.log(`Place ready: ${place.name} (${placeId})`);
  }

  console.log("Bern discovery map seed complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
