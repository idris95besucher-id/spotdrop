import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);

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
    }
  }
}

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const guideEmail = process.env.SPOTDROP_BERN_GUIDE_EMAIL || "bern_guide@spotdrop.local";
const LEGACY_TYPO_USERNAME = "bern_quide";

const GUIDE_PROFILE = {
  username: "bern_guide",
  name: "Bern Guide",
  bio: "Best places, food, events and local tips in Bern 🇨🇭",
  country_slug: "switzerland",
  city_slug: "bern",
  is_ai_guide: true,
  is_official: true,
  is_verified: true,
  is_private: false,
};

const GUIDE_POSTS = [
  "Official AI Guide tip: Start a first Bern walk at Zytglogge, then continue through Kramgasse toward the Nydegg Bridge. Go early morning for quieter arcades and softer light on the sandstone buildings.",
  "Official AI Guide tip: For a classic Bern cafe stop, try Kaffee Montag or Adriano's near the old town. Both work well for a short pause between sightseeing, studying, or meeting friends.",
  "Official AI Guide tip: The Rose Garden is one of the easiest viewpoints in Bern. Walk up before sunset, bring a light jacket, and look back over the Aare loop and the old town roofs.",
  "Official AI Guide tip: For affordable student-friendly food, check the area around Länggasse. It has casual lunch spots, bakeries, and places that feel more local than the main tourist streets.",
  "Official AI Guide tip: Marzili is perfect when the weather is warm. Walk along the Aare, sit on the grass, and only swim if conditions are safe and you understand the river current.",
  "Official AI Guide tip: For a rainy day, combine Zentrum Paul Klee with a tram ride and a relaxed cafe afterward. It is a calm option when outdoor plans do not work.",
  "Official AI Guide tip: Hidden spot idea: walk through Mattequartier below the old town. It feels quieter, has narrow lanes near the river, and gives a different view of Bern.",
  "Official AI Guide tip: For a simple Bern evening plan, choose dinner near Kornhausplatz, then walk under the arcades toward Bundesplatz when the city lights come on.",
  "Official AI Guide tip: Weekend market mornings around Bundesplatz are great for snacks, flowers, and local atmosphere. Arrive before lunch for the best selection.",
  "Official AI Guide tip: Gurten is the easy nature escape above Bern. Take the funicular, walk the top loop, and save it for a clear day if you want mountain views.",
];

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

  const { data: typoProfile, error: typoProfileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", LEGACY_TYPO_USERNAME)
    .maybeSingle();

  if (typoProfileError) {
    throw new Error(`Unable to check legacy guide profile typo: ${typoProfileError.message}`);
  }

  if (typoProfile?.id) {
    return typoProfile.id;
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
    throw new Error(`Unable to create guide auth user: ${error?.message ?? "No user returned"}`);
  }

  return data.user.id;
}

async function archiveTypoProfiles(guideUserId) {
  const { error } = await supabase
    .from("profiles")
    .update({
      username: `${LEGACY_TYPO_USERNAME}_archived`,
      updated_at: new Date().toISOString(),
    })
    .eq("username", LEGACY_TYPO_USERNAME)
    .neq("id", guideUserId);

  if (error) {
    throw new Error(`Unable to archive legacy guide typo profile: ${error.message}`);
  }
}

async function seedGuide() {
  const guideUserId = await getOrCreateGuideUser();

  await archiveTypoProfiles(guideUserId);

  const { error: upsertProfileError } = await supabase.from("profiles").upsert({
    id: guideUserId,
    ...GUIDE_PROFILE,
    updated_at: new Date().toISOString(),
  });

  if (upsertProfileError) {
    throw new Error(`Unable to upsert guide profile: ${upsertProfileError.message}`);
  }

  const { data: existingPosts, error: existingPostsError } = await supabase
    .from("posts")
    .select("content")
    .eq("user_id", guideUserId);

  if (existingPostsError) {
    throw new Error(`Unable to load existing guide posts: ${existingPostsError.message}`);
  }

  const existingContent = new Set((existingPosts ?? []).map((post) => post.content));
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
      throw new Error(`Unable to insert guide posts: ${insertPostsError.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        username: GUIDE_PROFILE.username,
        profileId: guideUserId,
        insertedPosts: postsToInsert.length,
        totalPreparedPosts: GUIDE_POSTS.length,
      },
      null,
      2
    )
  );
}

seedGuide().catch((error) => {
  console.error("Bern guide seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
