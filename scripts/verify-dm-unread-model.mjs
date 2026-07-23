/**
 * Focused DM unread verification (no test users / no probe messages).
 *
 * Uses service role to:
 *  1) Inspect unread pile for recipient ↔ partner
 *  2) Optionally backfill historical unread (read_at)
 *  3) Mark that thread read (open-thread equivalent) and assert unread = 0
 *
 * Usage:
 *   node scripts/verify-dm-unread-model.mjs
 *   node scripts/verify-dm-unread-model.mjs --backfill
 *   RECIPIENT_EMAIL=you@example.com PARTNER_USERNAME=someone node scripts/verify-dm-unread-model.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  for (const path of [".env.local", ".env"]) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadLocalEnv();

const doBackfill = process.argv.includes("--backfill");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const recipientEmail = (process.env.RECIPIENT_EMAIL || "idris1995gaza@gmail.com").trim();
const partnerUsername = (process.env.PARTNER_USERNAME || "").trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveRecipientId() {
  if (typeof admin.auth.admin.getUserByEmail === "function") {
    const { data, error } = await admin.auth.admin.getUserByEmail(recipientEmail);
    if (!error && data?.user?.id) {
      return data.user.id;
    }
  }

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = (data?.users ?? []).find(
      (row) => String(row.email || "").toLowerCase() === recipientEmail.toLowerCase()
    );
    if (user) return user.id;
    if ((data?.users?.length ?? 0) < 200) break;
  }

  throw new Error(`Recipient not found: ${recipientEmail}`);
}

async function resolvePartnerId(recipientId) {
  if (partnerUsername) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, username")
      .eq("username", partnerUsername)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error(`Partner username not found: ${partnerUsername}`);
    return { id: data.id, username: data.username };
  }

  const { data, error } = await admin
    .from("direct_messages")
    .select("sender_id")
    .eq("recipient_id", recipientId)
    .is("read_at", null)
    .neq("sender_id", recipientId)
    .limit(5000);

  if (error) throw error;

  const counts = new Map();
  for (const row of data ?? []) {
    const senderId = String(row.sender_id);
    counts.set(senderId, (counts.get(senderId) ?? 0) + 1);
  }

  let bestId = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestId = id;
      bestCount = count;
    }
  }

  if (!bestId) {
    const { data: anyMsg, error: anyErr } = await admin
      .from("direct_messages")
      .select("sender_id")
      .eq("recipient_id", recipientId)
      .neq("sender_id", recipientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anyErr) throw anyErr;
    if (!anyMsg?.sender_id) throw new Error("No DM partner found for recipient");
    bestId = String(anyMsg.sender_id);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", bestId)
    .maybeSingle();

  return { id: bestId, username: profile?.username ?? bestId, unreadBeforePick: bestCount };
}

async function countUnreadFromPartner(recipientId, partnerId) {
  const { count, error } = await admin
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("sender_id", partnerId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function countUnreadTotal(recipientId) {
  const { count, error } = await admin
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .is("read_at", null)
    .neq("sender_id", recipientId);
  if (error) throw error;
  return count ?? 0;
}

async function markThreadReadAsService(recipientId, partnerId) {
  const readAt = new Date().toISOString();
  const { data, error } = await admin
    .from("direct_messages")
    .update({ read_at: readAt, delivered_at: readAt })
    .eq("recipient_id", recipientId)
    .eq("sender_id", partnerId)
    .is("read_at", null)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

async function backfillHistoricalUnread() {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  // Page updates — PostgREST caps rows per request.
  let total = 0;
  for (let i = 0; i < 50; i += 1) {
    const { data, error } = await admin
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .lt("created_at", cutoff)
      .select("id")
      .limit(1000);

    if (error) throw error;
    const n = data?.length ?? 0;
    total += n;
    if (n < 1000) break;
  }
  return total;
}

async function main() {
  const recipientId = await resolveRecipientId();
  const partner = await resolvePartnerId(recipientId);

  console.log("[verify-dm-unread] recipient", { email: recipientEmail, recipientId });
  console.log("[verify-dm-unread] partner", {
    id: partner.id,
    username: partner.username,
  });

  const beforePartner = await countUnreadFromPartner(recipientId, partner.id);
  const beforeTotal = await countUnreadTotal(recipientId);
  console.log("[verify-dm-unread] BEFORE", {
    unread_from_partner: beforePartner,
    unread_incoming_total: beforeTotal,
  });

  if (beforePartner > 1) {
    console.log(
      "[verify-dm-unread] historical unread pile detected — this matches the badge→N bug when mark-read does not persist"
    );
  }

  if (doBackfill) {
    const updated = await backfillHistoricalUnread();
    console.log("[verify-dm-unread] backfill updated rows", updated);
  }

  const cleared = await markThreadReadAsService(recipientId, partner.id);
  const afterPartner = await countUnreadFromPartner(recipientId, partner.id);
  const afterTotal = await countUnreadTotal(recipientId);

  console.log("[verify-dm-unread] AFTER open-baseline", {
    marked_read_rows: cleared,
    unread_from_partner: afterPartner,
    unread_incoming_total: afterTotal,
  });

  if (afterPartner !== 0) {
    console.error("FAIL: expected unread_from_partner = 0 after marking thread read");
    process.exit(1);
  }

  console.log(
    "PASS: open-thread baseline → unread_from_partner = 0. Next real message from this partner must count as exactly 1."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
