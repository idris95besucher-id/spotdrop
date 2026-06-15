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

const GUIDE_USERNAME_PATTERN = /_(guide|quide)$/i;
const GUIDE_NAME_PATTERN = /official\s+(ai\s+)?(swiss\s+|bern\s+)?guide|^(bern|swiss|cyprus)\s+guide$/i;

const KNOWN_GUIDE_USERNAMES = new Set([
  "bern_guide",
  "swiss_guide",
  "cyprus_guide",
  "bern_quide",
  "swiss_quide",
  "spot_guide",
  "official_ai_guide",
  "ai_guide",
]);

function isGuideProfile(profile) {
  const username = typeof profile.username === "string" ? profile.username.trim() : "";
  const name = typeof profile.name === "string" ? profile.name.trim() : "";

  if (username && (KNOWN_GUIDE_USERNAMES.has(username.toLowerCase()) || GUIDE_USERNAME_PATTERN.test(username))) {
    return true;
  }

  return name.length > 0 && GUIDE_NAME_PATTERN.test(name);
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, name");

  if (profilesError) {
    console.error("Failed to load profiles:", profilesError.message);
    process.exit(1);
  }

  const guideProfiles = (profiles ?? []).filter(isGuideProfile);

  if (guideProfiles.length === 0) {
    console.log("No guide accounts found (bern_guide, swiss_guide, Official AI Guide, etc.).");
    return;
  }

  console.log(`Found ${guideProfiles.length} guide account(s):`);
  for (const profile of guideProfiles) {
    console.log(`  - ${profile.username}${profile.name ? ` (${profile.name})` : ""} [${profile.id}]`);
  }

  const guideIds = guideProfiles.map((profile) => profile.id);

  for (const guideId of guideIds) {
    const { data: posts } = await supabase.from("posts").select("id").eq("user_id", guideId);
    const postIds = (posts ?? []).map((post) => post.id);

    if (postIds.length > 0) {
      await supabase.from("guide_places").delete().in("post_id", postIds);
      await supabase.from("post_reactions").delete().in("post_id", postIds);
      await supabase.from("post_comments").delete().in("post_id", postIds);
    }

    await supabase.from("post_reactions").delete().eq("user_id", guideId);
    await supabase.from("post_comments").delete().eq("user_id", guideId);
    await supabase.from("posts").delete().eq("user_id", guideId);
    await supabase.from("direct_messages").delete().or(`sender_id.eq.${guideId},recipient_id.eq.${guideId}`);
    await supabase.from("city_messages").delete().eq("user_id", guideId);
    await supabase.from("city_channel_messages").delete().eq("user_id", guideId);
    await supabase.from("follows").delete().or(`follower_id.eq.${guideId},following_id.eq.${guideId}`);
    await supabase.from("profiles").delete().eq("id", guideId);

    const { error: authError } = await supabase.auth.admin.deleteUser(guideId);
    if (authError) {
      console.warn(`  auth delete skipped for ${guideId}: ${authError.message}`);
    }
  }

  console.log("Guide accounts removed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
