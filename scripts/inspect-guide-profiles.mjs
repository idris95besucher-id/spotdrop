import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const patterns = ["bern", "swiss", "cyprus", "guide"];

async function main() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, name, is_demo, bio, created_at")
    .order("username");

  if (error) {
    console.error("profiles query failed:", error.message);
    process.exit(1);
  }

  const matches = (profiles ?? []).filter((p) => {
    const u = (p.username ?? "").toLowerCase();
    const n = (p.name ?? "").toLowerCase();
    return patterns.some((pat) => u.includes(pat) && u.includes("guide")) || n.includes("guide");
  });

  console.log("\n=== GUIDE-LIKE PROFILES IN SUPABASE profiles TABLE ===\n");
  if (matches.length === 0) {
    console.log("No matching rows found.");
  } else {
    for (const p of matches) {
      console.log(JSON.stringify(p, null, 2));
    }
  }

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id, user_id, content_kind, content, profiles(username, name)")
    .limit(200);

  if (!postsError) {
    const guidePosts = (posts ?? []).filter((post) => {
      const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
      const u = (profile?.username ?? "").toLowerCase();
      return u.includes("guide");
    });

    console.log(`\n=== POSTS BY GUIDE USERS (${guidePosts.length}) ===\n`);
    for (const post of guidePosts.slice(0, 10)) {
      const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
      console.log({ postId: post.id, username: profile?.username, kind: post.content_kind });
    }
  }

  console.log(`\nTotal profiles in DB: ${profiles?.length ?? 0}`);
}

main().catch(console.error);
