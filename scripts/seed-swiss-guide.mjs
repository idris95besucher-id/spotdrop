import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envBeforeLocalFile = new Set(Object.keys(process.env));

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return { envFileFound: false, loadedKeys: new Set() };
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  const loadedKeys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
      loadedKeys.add(key);
    }
  }

  return { envFileFound: true, loadedKeys };
}

const localEnvStatus = loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const guideEmail = process.env.SPOTDROP_SWISS_GUIDE_EMAIL || "swiss_guide@spotdrop.local";

const GUIDE_PLACES_SQL = `create table if not exists public.guide_places (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade unique,
  title text not null,
  location_name text,
  canton text,
  city text,
  description text,
  opening_hours text,
  price_info text,
  official_url text,
  read_more_text text,
  media_url text,
  media_type text check (media_type is null or media_type in ('image', 'video')),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guide_places enable row level security;

drop policy if exists "Authenticated users can read public guide places" on public.guide_places;
create policy "Authenticated users can read public guide places"
on public.guide_places for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and (
        posts.visibility = 'public'
        or posts.user_id = auth.uid()
      )
  )
);

drop policy if exists "Post owners can manage own guide places" on public.guide_places;
create policy "Post owners can manage own guide places"
on public.guide_places for all
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and posts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and posts.user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';`;

const GUIDE_PROFILE = {
  username: "swiss_guide",
  name: "Swiss Guide",
  bio: "Discover the most beautiful places in Switzerland 🇨🇭",
  country_slug: "switzerland",
  city_slug: null,
  is_ai_guide: true,
  is_official: true,
  is_verified: true,
  is_private: false,
};

const GUIDE_POSTS = [
  "Official AI Guide: Blausee feels like a hidden jewel in the Bernese Oberland. Visit early for calm turquoise water, forest reflections, and a peaceful walk around the lake.",
  "Official AI Guide: Interlaken is a perfect base for Swiss adventure days. The views between Lake Thun and Lake Brienz make even a simple walk feel cinematic.",
  "Official AI Guide: Lauterbrunnen is one of Switzerland's most dramatic valleys, with cliffs, waterfalls, and quiet paths that look beautiful in every season.",
  "Official AI Guide: Grindelwald is made for mountain views. Take time for the First cliff walk, alpine trails, and wide panoramas toward the Eiger.",
  "Official AI Guide: Zermatt is all about the Matterhorn. For the best travel feeling, ride up to Gornergrat and watch the peaks change color with the light.",
  "Official AI Guide: Oeschinensee is one of the most beautiful alpine lakes in Switzerland. The hike down to the water gives unforgettable views of blue water and high cliffs.",
  "Official AI Guide: Rhine Falls is Switzerland's most powerful waterfall. Stand close to the spray, then walk the viewpoints for different angles of the river.",
  "Official AI Guide: Appenzell is perfect for colorful houses, rolling hills, and mountain culture. Pair the village with a hike toward Ebenalp or Seealpsee.",
  "Official AI Guide: Lucerne combines lake, mountains, bridges, and old town charm. Walk the Chapel Bridge, then continue along the water for classic Swiss views.",
  "Official AI Guide: The Swiss Alps are best enjoyed slowly. Choose one region, wake up early, and let the changing clouds reveal the peaks throughout the day.",
  "Official AI Guide: Hidden lakes in Switzerland reward curious travelers. Look for smaller alpine lakes near hiking routes where the water is still and the crowds are lighter.",
  "Official AI Guide: Swiss mountain villages are part of the magic. Villages like Mürren, Wengen, and Soglio feel peaceful, scenic, and deeply connected to the landscape.",
  "Official AI Guide: Viewpoints make Switzerland unforgettable. Harder Kulm, Rigi, Stanserhorn, and Gornergrat each show a different side of the country from above.",
  "Official AI Guide: Hiking in Switzerland is about choosing the right trail for your energy and weather. Start early, check conditions, and bring layers even on sunny days.",
  "Official AI Guide: Swiss train views are a journey by themselves. Routes like the Glacier Express, Bernina line, and GoldenPass turn travel time into part of the destination.",
];

const GUIDE_PLACE_POSTS = [
  {
    content:
      "Official AI Guide place card: Blausee is a small turquoise lake in the Bernese Oberland, known for clear water, forest paths, and a peaceful alpine atmosphere.",
    place: {
      title: "Blausee",
      location_name: "Bernese Oberland, Switzerland",
      canton: "Bern",
      city: "Kandergrund",
      description:
        "Blausee is a scenic mountain lake with deep blue water, quiet forest paths, and easy walking routes. It is a beautiful stop for travelers exploring the Bernese Oberland.",
      opening_hours: "Open daily. Check the official website before visiting because hours can change by season.",
      price_info: "Paid entrance. Prices can change by season, so check the official website before visiting.",
      official_url: "https://www.blausee.ch/en/welcome/",
      read_more_text: "Plan a calm lake visit, walk the forest paths, and check current visitor information before you go.",
      media_url: "/guide-places/blausee.svg",
      media_type: "image",
      source_url: "Admin-approved generated illustration stored in SpotDrop public assets.",
    },
  },
];

function getEnvSource(key) {
  if (localEnvStatus.loadedKeys.has(key)) {
    return ".env.local";
  }

  if (envBeforeLocalFile.has(key)) {
    return "terminal environment";
  }

  return "missing";
}

function getSupabaseProjectRefFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  const payload = token?.split(".")?.[1];

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function logConnectionDebugInfo() {
  const urlProjectRef = getSupabaseProjectRefFromUrl(supabaseUrl);
  const serviceRolePayload = decodeJwtPayload(serviceRoleKey);
  const serviceRoleProjectRef = typeof serviceRolePayload?.ref === "string" ? serviceRolePayload.ref : null;

  console.log(
    JSON.stringify(
      {
        supabaseConnection: {
          envLocalFound: localEnvStatus.envFileFound,
          nextPublicSupabaseUrlSource: getEnvSource("NEXT_PUBLIC_SUPABASE_URL"),
          serviceRoleKeySource: getEnvSource("SUPABASE_SERVICE_ROLE_KEY"),
          supabaseUrl,
          supabaseUrlProjectRef: urlProjectRef,
          serviceRoleProjectRef,
          sameProject: Boolean(urlProjectRef && serviceRoleProjectRef && urlProjectRef === serviceRoleProjectRef),
        },
      },
      null,
      2
    )
  );

  if (urlProjectRef && serviceRoleProjectRef && urlProjectRef !== serviceRoleProjectRef) {
    throw new Error(
      `Supabase project mismatch: NEXT_PUBLIC_SUPABASE_URL points to "${urlProjectRef}", but SUPABASE_SERVICE_ROLE_KEY belongs to "${serviceRoleProjectRef}". Create guide_places in project "${urlProjectRef}" or use the service role key from that same project.`
    );
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    `Missing required environment values: ${[
      !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    ]
      .filter(Boolean)
      .join(", ")}.`
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function verifyGuidePlacesTable() {
  console.log("Checking guide_places table with: .from(\"guide_places\").select(\"*\").limit(1)");

  const { error } = await supabase.from("guide_places").select("*").limit(1);

  if (!error) {
    console.log("guide_places table check passed.");
    return;
  }

  console.error("guide_places table check failed:", JSON.stringify(error, null, 2));
  console.error("Run this SQL in the same Supabase project, then wait 20-30 seconds and run seed again:\n");
  console.error(GUIDE_PLACES_SQL);

  throw new Error("Stopping seed: guide_places table check did not pass.");
}

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`Unable to list auth users: ${error.message}`);
    }

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());

    if (user) {
      return user;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function getOrCreateGuideUser() {
  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", GUIDE_PROFILE.username)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to load existing guide profile: ${profileError.message}`);
  }

  if (existingProfile?.id) {
    return existingProfile.id;
  }

  const existingAuthUser = await findAuthUserByEmail(guideEmail);

  if (existingAuthUser?.id) {
    return existingAuthUser.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: guideEmail,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: {
      username: GUIDE_PROFILE.username,
      display_name: GUIDE_PROFILE.name,
      account_type: "official_ai_guide",
    },
  });

  if (error || !data.user?.id) {
    throw new Error(`Unable to create Swiss guide auth user: ${error?.message ?? "No user returned"}`);
  }

  return data.user.id;
}

async function seedGuide() {
  logConnectionDebugInfo();
  await verifyGuidePlacesTable();

  const guideUserId = await getOrCreateGuideUser();

  const { error: upsertProfileError } = await supabase.from("profiles").upsert({
    id: guideUserId,
    ...GUIDE_PROFILE,
    updated_at: new Date().toISOString(),
  });

  if (upsertProfileError) {
    throw new Error(`Unable to upsert Swiss guide profile: ${upsertProfileError.message}`);
  }

  const { data: existingPosts, error: existingPostsError } = await supabase
    .from("posts")
    .select("id, content")
    .eq("user_id", guideUserId);

  if (existingPostsError) {
    throw new Error(`Unable to load existing Swiss guide posts: ${existingPostsError.message}`);
  }

  const existingContent = new Map((existingPosts ?? []).map((post) => [post.content, post.id]));
  const postsToInsert = GUIDE_POSTS.filter((content) => !existingContent.has(content)).map((content, index) => ({
    user_id: guideUserId,
    content,
    visibility: "public",
    created_at: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }));

  if (postsToInsert.length > 0) {
    const { error: insertPostsError } = await supabase.from("posts").insert(postsToInsert);

    if (insertPostsError) {
      throw new Error(`Unable to insert Swiss guide posts: ${insertPostsError.message}`);
    }
  }

  let insertedPlacePosts = 0;

  for (const guidePlacePost of GUIDE_PLACE_POSTS) {
    let postId = existingContent.get(guidePlacePost.content);

    if (!postId) {
      const { data: insertedPost, error: insertPlacePostError } = await supabase
        .from("posts")
        .insert({
          user_id: guideUserId,
          content: guidePlacePost.content,
          visibility: "public",
          media_url: guidePlacePost.place.media_url,
          media_type: guidePlacePost.place.media_type,
          created_at: new Date(Date.now() - (GUIDE_POSTS.length + insertedPlacePosts) * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertPlacePostError || !insertedPost?.id) {
        throw new Error(`Unable to insert Swiss guide place post: ${insertPlacePostError?.message ?? "No post returned"}`);
      }

      postId = insertedPost.id;
      insertedPlacePosts += 1;
    }

    const { error: upsertPlaceError } = await supabase.from("guide_places").upsert(
      {
        post_id: postId,
        ...guidePlacePost.place,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "post_id" }
    );

    if (upsertPlaceError) {
      throw new Error(
        `Unable to upsert Swiss guide place card. Run database/add-guide-places.sql first. Details: ${upsertPlaceError.message}`
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        username: GUIDE_PROFILE.username,
        profileId: guideUserId,
        insertedPosts: postsToInsert.length,
        insertedPlacePosts,
        totalPreparedPosts: GUIDE_POSTS.length,
        totalPreparedPlacePosts: GUIDE_PLACE_POSTS.length,
      },
      null,
      2
    )
  );
}

seedGuide().catch((error) => {
  console.error("Swiss guide seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
