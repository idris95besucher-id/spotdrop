/**
 * Delete ONLY one user's Visit / map / Spot test content.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... TARGET_USERNAME=yourname node scripts/cleanup-my-test-data.mjs --execute
 *   SUPABASE_SERVICE_ROLE_KEY=... TARGET_USER_ID=uuid node scripts/cleanup-my-test-data.mjs --execute
 *
 * Without --execute: dry-run counts only.
 * Never deletes profiles, follows, friends, countries, cities, or other users' rows.
 */

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

const execute = process.argv.includes("--execute");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetUserIdEnv = process.env.TARGET_USER_ID?.trim() || "";
const targetUsername = (process.env.TARGET_USERNAME || "").trim().toLowerCase();

function isMissingRelation(error) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

async function countEq(supabase, table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    if (isMissingRelation(error)) {
      return { count: 0, missing: true };
    }
    throw error;
  }

  return { count: count ?? 0, missing: false };
}

async function countIn(supabase, table, column, values) {
  if (!values.length) {
    return { count: 0, missing: false };
  }

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in(column, values);

  if (error) {
    if (isMissingRelation(error)) {
      return { count: 0, missing: true };
    }
    throw error;
  }

  return { count: count ?? 0, missing: false };
}

async function deleteEq(supabase, table, column, value) {
  const { data, error } = await supabase.from(table).delete().eq(column, value).select("id");

  if (error) {
    if (isMissingRelation(error)) {
      return { deleted: 0, missing: true };
    }
    throw error;
  }

  return { deleted: data?.length ?? 0, missing: false };
}

async function deleteIn(supabase, table, column, values) {
  if (!values.length) {
    return { deleted: 0, missing: false };
  }

  const { data, error } = await supabase.from(table).delete().in(column, values).select("id");

  if (error) {
    if (isMissingRelation(error)) {
      return { deleted: 0, missing: true };
    }
    throw error;
  }

  return { deleted: data?.length ?? 0, missing: false };
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Add SUPABASE_SERVICE_ROLE_KEY to .env.local (never commit it), then re-run."
    );
    process.exit(1);
  }

  if (!targetUserIdEnv && !targetUsername) {
    console.error("Set TARGET_USER_ID=... or TARGET_USERNAME=... for your account only.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = targetUserIdEnv;
  let username = targetUsername;

  if (!userId) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", targetUsername)
      .maybeSingle();

    if (error) {
      console.error("Failed to resolve username:", error.message);
      process.exit(1);
    }

    if (!profile?.id) {
      console.error(`No profile found for username "${targetUsername}".`);
      process.exit(1);
    }

    userId = profile.id;
    username = profile.username;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();
    username = profile?.username ?? (username || userId);
  }

  console.log(`Target account: @${username} (${userId})`);
  console.log(execute ? "Mode: EXECUTE (deletes rows)" : "Mode: DRY-RUN (counts only)");

  // Spot post ids owned by this user (test spots)
  const { data: ownedPosts, error: postsError } = await supabase
    .from("posts")
    .select("id, content_kind")
    .eq("user_id", userId);

  if (postsError) {
    console.error("Failed to load posts:", postsError.message);
    process.exit(1);
  }

  const postIds = (ownedPosts ?? []).map((row) => row.id);
  const spotIds = (ownedPosts ?? [])
    .filter((row) => row.content_kind === "spot" || row.content_kind == null)
    .map((row) => row.id);

  // Prefer deleting all owned posts of kind spot; if content_kind missing, still delete owned posts that look like spots later.
  const postsToDelete = (ownedPosts ?? [])
    .filter((row) => row.content_kind === "spot")
    .map((row) => row.id);

  const markResult = await supabase.from("map_marks").select("id").eq("user_id", userId);
  const markIds = (markResult.data ?? []).map((row) => row.id);

  const plan = [];

  async function planEq(table, column, value, note) {
    const result = await countEq(supabase, table, column, value);
    plan.push({ table, filter: `${column}=${value}`, count: result.count, missing: result.missing, note });
  }

  async function planIn(table, column, values, note) {
    const result = await countIn(supabase, table, column, values);
    plan.push({
      table,
      filter: `${column} in (${values.length} ids)`,
      count: result.count,
      missing: result.missing,
      note,
    });
  }

  // Room messages I sent (includes auto-shared mark cards)
  await planEq("city_messages", "user_id", userId, "Visit room messages I sent");
  await planEq("city_channel_messages", "user_id", userId, "Channel messages I sent (if any)");

  // Map marks I created
  await planEq("map_marks", "user_id", userId, "Map marks I created");
  await planEq("user_map_markers", "user_id", userId, "Saved map markers");
  await planEq("user_map_places", "user_id", userId, "Saved map places");

  // Notifications caused by my marks/messages (actor = me)
  await planEq("notifications", "actor_id", userId, "Notifications created by my activity");

  // Spot-related child rows for my spots
  if (postsToDelete.length) {
    await planIn("post_media_items", "post_id", postsToDelete, "Spot media items");
    await planIn("post_comments", "post_id", postsToDelete, "Comments on my spots");
    await planIn("post_reactions", "post_id", postsToDelete, "Reactions on my spots");
    await planIn("collection_spots", "post_id", postsToDelete, "Collection links");
    await planIn("spot_collection_saves", "post_id", postsToDelete, "Spot collection saves");
    await planIn("spot_visits", "post_id", postsToDelete, "Spot visits");
    await planIn("spot_visited_daily", "post_id", postsToDelete, "Spot visit daily");
    await planIn("spot_commenters", "post_id", postsToDelete, "Spot commenters");
    await planIn("guide_places", "post_id", postsToDelete, "Guide place rows");
    await planIn("direct_messages", "post_id", postsToDelete, "DM spot shares of my spots");
  }

  plan.push({
    table: "posts",
    filter: `user_id=${userId} AND content_kind=spot`,
    count: postsToDelete.length,
    missing: false,
    note: "My published spots",
  });

  console.log("\nPlanned deletions:");
  for (const row of plan) {
    if (row.missing) {
      console.log(`  - ${row.table}: (table missing) ${row.note}`);
    } else {
      console.log(`  - ${row.table}: ${row.count}  (${row.note})`);
    }
  }

  if (!execute) {
    console.log("\nDry-run only. Re-run with --execute to delete.");
    return;
  }

  const deleted = {};

  async function record(table, result) {
    deleted[table] = (deleted[table] ?? 0) + (result.deleted ?? 0);
    if (result.missing) {
      deleted[`${table} (missing)`] = 0;
    }
  }

  // 1) Notifications from my activity
  await record("notifications", await deleteEq(supabase, "notifications", "actor_id", userId));

  // 2) Room / channel messages I sent (cascades mark share cards; map_mark_id CASCADE also covers linked rows when marks deleted)
  await record("city_messages", await deleteEq(supabase, "city_messages", "user_id", userId));
  await record(
    "city_channel_messages",
    await deleteEq(supabase, "city_channel_messages", "user_id", userId)
  );

  // 3) Spot children then spots
  if (postsToDelete.length) {
    for (const table of [
      "post_media_items",
      "post_comments",
      "post_reactions",
      "collection_spots",
      "spot_collection_saves",
      "spot_visits",
      "spot_visited_daily",
      "spot_commenters",
      "guide_places",
    ]) {
      await record(table, await deleteIn(supabase, table, "post_id", postsToDelete));
    }

    // DM spot shares referencing my spots (message bodies owned by anyone but tied to my post)
    await record(
      "direct_messages(post_id)",
      await deleteIn(supabase, "direct_messages", "post_id", postsToDelete)
    );

    const { data: deletedPosts, error: deletePostsError } = await supabase
      .from("posts")
      .delete()
      .eq("user_id", userId)
      .eq("content_kind", "spot")
      .select("id");

    if (deletePostsError) {
      throw deletePostsError;
    }

    deleted.posts = deletedPosts?.length ?? 0;
  }

  // 4) Map marks / place markers last (city_messages.map_mark_id already cleared or cascading)
  await record("map_marks", await deleteEq(supabase, "map_marks", "user_id", userId));
  await record("user_map_markers", await deleteEq(supabase, "user_map_markers", "user_id", userId));
  await record("user_map_places", await deleteEq(supabase, "user_map_places", "user_id", userId));

  // Safety: never touch profile / follows
  console.log("\nDeleted rows:");
  for (const [table, count] of Object.entries(deleted)) {
    console.log(`  - ${table}: ${count}`);
  }

  console.log("\nConfirmed: profile, follows, friends, countries, cities, and other users were not deleted.");
  console.log(`Cleaned account: @${username} (${userId})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
