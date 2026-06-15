#!/usr/bin/env node
/**
 * Audit where Bern_Guide / Swiss_Guide can appear.
 * Usage: node scripts/audit-guide-sources.mjs
 */
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = serviceKey || anonKey;

console.log(`
=== GUIDE ACCOUNT SOURCE AUDIT ===

1) CODEBASE SEARCH (Bern_Guide / Swiss_Guide / Cyprus_Guide)
   - NOT in any hardcoded UI array or mock feed.
   - NOT in lib/demoFeed.ts (only food_finder, city_tips, travel_local).
   - ONLY referenced in filter/delete utilities:
     lib/guideAccounts.ts, database/delete-guide-accounts.sql, scripts/delete-guide-accounts.mjs

2) ORIGINAL CREATION (removed from repo, still in git history)
   - scripts/seed-bern-guide.mjs  → profiles.username = "bern_guide", name = "Bern Guide"
                                    legacy typo "bern_quide", email bern_guide@spotdrop.local
   - scripts/seed-swiss-guide.mjs → profiles.username = "swiss_guide", name = "Swiss Guide"
   - scripts/seed-bern-discovery.mjs (old) → posts linked to bern_guide user + discovery_place_id
   - Cyprus_Guide: never in repo seeds; would only exist if inserted manually in Supabase.

3) LIVE DATA SOURCE (production)
   Table: public.profiles     (username, name, bio, …)
   Table: auth.users          (email bern_guide@spotdrop.local / swiss_guide@spotdrop.local)
   Table: public.posts        (user_id → guide profile ids, often discovery_place_id set)
   Table: public.guide_places (place cards on posts — NOT user accounts)

4) APP QUERIES THAT LOAD & DISPLAY GUIDE USERNAMES
   Search (profiles table):
     app/search/page.tsx:90  → supabase.from("profiles").select(...)
   Post detail (posts + profiles join, NO guide block until fixed):
     app/posts/[postId]/page.tsx:180
   Discovery map place feed:
     lib/stories.ts:303        loadPlaceFeed()
     lib/discoveryPlaces.ts:216 loadPlaceContent()
   Map / feed / followers: filtered in lib/spots.ts, lib/feed.ts, lib/follows.ts
`);

if (!url || !key) {
  console.log("Skipping live DB check — missing Supabase env vars.\n");
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const usernameVariants = [
  "bern_guide",
  "Bern_Guide",
  "swiss_guide",
  "Swiss_Guide",
  "bern_quide",
  "cyprus_guide",
  "Cyprus_Guide",
];

console.log("5) LIVE DATABASE CHECK\n");
console.log(`   Project: ${url}`);
console.log(`   Key type: ${serviceKey ? "service_role (full access)" : "anon (RLS applies)"}\n`);

for (const username of usernameVariants) {
  const { data } = await supabase.from("profiles").select("id, username, name, is_demo, bio").eq("username", username);
  if (data?.length) {
    console.log(`   FOUND profiles row: ${JSON.stringify(data[0])}`);
  }
}

const { data: patternRows } = await supabase
  .from("profiles")
  .select("id, username, name, is_demo")
  .or("username.ilike.%_guide,username.ilike.%_quide,name.ilike.%guide%");

console.log(`\n   Pattern match (profiles): ${patternRows?.length ?? 0} row(s)`);
for (const row of patternRows ?? []) {
  console.log(`   - ${row.username}${row.name ? ` / "${row.name}"` : ""} [${row.id}]`);
}

const { count: profileCount } = await supabase.from("profiles").select("*", { count: "exact", head: true });
console.log(`\n   Total profiles visible with current key: ${profileCount ?? "?"}`);

if ((patternRows?.length ?? 0) > 0) {
  console.log(`
6) DELETE
   Run: npm run db:delete-guide-accounts
   Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
   Or run database/delete-guide-accounts.sql in Supabase SQL editor.
`);
} else if (profileCount === 0) {
  console.log(`
6) NOTE
   This Supabase project has 0 profiles with the current API key.
   If you still see Bern_Guide / Swiss_Guide in the deployed app, either:
   - Production uses a different Supabase project than .env.local
   - Or the deployed build is stale (redeploy after deleting rows in the correct project)
`);
} else {
  console.log("\n6) No guide-pattern profiles found in this project.\n");
}
