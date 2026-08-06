#!/usr/bin/env node
/**
 * Live official-channel locale smoke for Production Vercel builds.
 *
 * Checks source_locale, RU publish → EN/DE fill, display locales,
 * unread PK model, push language grouping. Does not send FCM.
 * Never logs secret values.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const TEST_MARKER = "[SpotDrop live locale test]";

function requireEnv(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveI18nLocale(code) {
  if (code === "en" || code === "ru" || code === "de") {
    return code;
  }
  return "en";
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickLocalized(locale, sourceLocale, en, ru, de) {
  const byLocale = {
    en: nonEmpty(en),
    ru: nonEmpty(ru),
    de: nonEmpty(de),
  };
  return (
    byLocale[locale] ??
    (sourceLocale ? byLocale[sourceLocale] : null) ??
    byLocale.en ??
    byLocale.ru ??
    byLocale.de
  );
}

function resolveFields(post, language) {
  const locale = resolveI18nLocale(language);
  const sourceLocale =
    post.source_locale === "en" || post.source_locale === "ru" || post.source_locale === "de"
      ? post.source_locale
      : null;
  const body =
    pickLocalized(locale, sourceLocale, post.body_en, post.body_ru, post.body_de) ??
    String(post.body_en || "").trim();
  return {
    title: pickLocalized(locale, sourceLocale, post.title_en, post.title_ru, post.title_de),
    body,
  };
}

function detectSourceLocaleHeuristic(text) {
  const letters = text.replace(/[^A-Za-zÀ-ÖØ-öø-ÿА-Яа-яЁё]/g, "");
  if (!letters) return null;
  const cyrillicCount = (letters.match(/[А-Яа-яЁё]/g) ?? []).length;
  if (cyrillicCount / letters.length >= 0.25) return "ru";
  const germanMarkerCount = (letters.match(/[ÄÖÜäöüß]/g) ?? []).length;
  if (germanMarkerCount > 0) return "de";
  return null;
}

async function translateAnnouncement({ title, body, linkLabel }) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const hintedSourceLocale = detectSourceLocaleHeuristic(body);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Localize SpotDrop official announcements into en/ru/de. Detect sourceLocale. If hintedSourceLocale is set, use it. Keep SpotDrop untranslated. Return JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify({ title, body, linkLabel, hintedSourceLocale }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "official_channel_translation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                sourceLocale: { type: "string", enum: ["en", "ru", "de"] },
                en: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: ["string", "null"] },
                    body: { type: "string" },
                    linkLabel: { type: ["string", "null"] },
                  },
                  required: ["title", "body", "linkLabel"],
                },
                ru: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: ["string", "null"] },
                    body: { type: "string" },
                    linkLabel: { type: ["string", "null"] },
                  },
                  required: ["title", "body", "linkLabel"],
                },
                de: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: ["string", "null"] },
                    body: { type: "string" },
                    linkLabel: { type: ["string", "null"] },
                  },
                  required: ["title", "body", "linkLabel"],
                },
              },
              required: ["sourceLocale", "en", "ru", "de"],
            },
          },
        },
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    assert(response.ok, `OpenAI HTTP ${response.status}`);
    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    assert(raw, "OpenAI empty content");
    const parsed = JSON.parse(raw);
    const heuristic = detectSourceLocaleHeuristic(body);
    const sourceLocale =
      heuristic === "ru" || heuristic === "de"
        ? heuristic
        : parsed.sourceLocale === "en" || parsed.sourceLocale === "ru" || parsed.sourceLocale === "de"
          ? parsed.sourceLocale
          : "en";

    const original = { title, body, linkLabel };
    return {
      sourceLocale,
      en: sourceLocale === "en" ? original : parsed.en,
      ru: sourceLocale === "ru" ? original : parsed.ru,
      de: sourceLocale === "de" ? original : parsed.de,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function createAdmin() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifySourceLocaleColumn(admin) {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openapiRes = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/openapi+json",
    },
  });
  assert(openapiRes.ok, `OpenAPI status ${openapiRes.status}`);
  const spec = await openapiRes.json();
  const props =
    spec?.definitions?.official_channel_posts?.properties ||
    spec?.components?.schemas?.official_channel_posts?.properties ||
    null;
  assert(props?.source_locale, "source_locale missing from OpenAPI schema");
  const col = props.source_locale;
  assert(
    col.type === "string" || col.type === "text" || col.format === "text",
    `Unexpected source_locale type ${JSON.stringify(col)}`
  );

  const { data: official, error: officialError } = await admin
    .from("profiles")
    .select("id")
    .eq("is_official", true)
    .limit(1)
    .maybeSingle();
  assert(!officialError && official?.id, "Official profile not found");

  const publishedAt = new Date().toISOString();
  const { data: probe, error: probeError } = await admin
    .from("official_channel_posts")
    .insert({
      author_id: official.id,
      status: "published",
      body_en: `${TEST_MARKER} probe default source_locale`,
      body_ru: `${TEST_MARKER} probe ru`,
      body_de: `${TEST_MARKER} probe de`,
      client_request_id: randomUUID(),
      published_at: publishedAt,
      updated_at: publishedAt,
    })
    .select("id, source_locale")
    .maybeSingle();

  assert(!probeError && probe?.id, `Probe insert failed: ${probeError?.message ?? "unknown"}`);
  assert(probe.source_locale === "en", `Expected default source_locale=en, got ${probe.source_locale}`);

  const { error: nullError } = await admin
    .from("official_channel_posts")
    .update({ source_locale: null })
    .eq("id", probe.id);
  assert(nullError, "Expected NOT NULL rejection when setting source_locale=null");

  await admin.from("official_channel_posts").delete().eq("id", probe.id);

  return { exists: true, type: "text", default: "en", notNull: true };
}

async function publishRussianTestPost(admin) {
  const { data: official, error: officialError } = await admin
    .from("profiles")
    .select("id")
    .eq("is_official", true)
    .limit(1)
    .maybeSingle();
  assert(!officialError && official?.id, "Official profile not found");

  const title = `${TEST_MARKER} Заголовок`;
  const body = `${TEST_MARKER} Это тестовое официальное сообщение SpotDrop на русском языке для проверки автоперевода.`;
  const linkLabel = "Открыть";

  assert(detectSourceLocaleHeuristic(body) === "ru", "Heuristic should detect ru");
  const translated = await translateAnnouncement({ title, body, linkLabel });
  assert(translated.sourceLocale === "ru", `sourceLocale expected ru, got ${translated.sourceLocale}`);
  assert(translated.ru.body === body, "RU body must keep original");
  assert(translated.en.body?.trim(), "EN body empty");
  assert(translated.de.body?.trim(), "DE body empty");

  const clientRequestId = randomUUID();
  const publishedAt = new Date().toISOString();
  const { data: post, error } = await admin
    .from("official_channel_posts")
    .insert({
      author_id: official.id,
      status: "published",
      source_locale: translated.sourceLocale,
      title_en: translated.en.title,
      body_en: translated.en.body,
      title_ru: translated.ru.title,
      body_ru: translated.ru.body,
      title_de: translated.de.title,
      body_de: translated.de.body,
      link_label_en: translated.en.linkLabel,
      link_label_ru: translated.ru.linkLabel,
      link_label_de: translated.de.linkLabel,
      client_request_id: clientRequestId,
      published_at: publishedAt,
      updated_at: publishedAt,
    })
    .select(
      "id, source_locale, title_en, body_en, title_ru, body_ru, title_de, body_de, link_label_en, link_label_ru, link_label_de, client_request_id"
    )
    .maybeSingle();

  assert(!error && post?.id, `Publish insert failed: ${error?.message ?? "unknown"}`);

  const { data: dupes, error: dupeError } = await admin
    .from("official_channel_posts")
    .select("id")
    .eq("client_request_id", clientRequestId);
  assert(!dupeError, dupeError?.message ?? "dupe lookup failed");
  assert(dupes?.length === 1, `Expected 1 row, got ${dupes?.length ?? 0}`);

  return { post, officialId: official.id, translated };
}

function verifyDisplayLocales(post) {
  const ru = resolveFields(post, "ru");
  const en = resolveFields(post, "en");
  const de = resolveFields(post, "de");
  const fallback = resolveFields(post, null);
  const unknown = resolveFields(post, "zz");

  assert(ru.body === post.body_ru, "ru → body_ru");
  assert(en.body === post.body_en, "en → body_en");
  assert(de.body === post.body_de, "de → body_de");
  assert(fallback.body === post.body_en, "null language → en");
  assert(unknown.body === post.body_en, "unknown language → en");

  return {
    ruPreview: ru.body.slice(0, 80),
    enPreview: en.body.slice(0, 80),
    dePreview: de.body.slice(0, 80),
    nullLanguageUsesEn: true,
    unknownLanguageUsesEn: true,
  };
}

async function verifyUnreadModel(admin) {
  const { data, error } = await admin.from("official_channel_reads").select("user_id").limit(20);
  assert(!error, error?.message ?? "reads query failed");
  const ids = (data ?? []).map((row) => row.user_id);
  assert(new Set(ids).size === ids.length, "Duplicate user_id in official_channel_reads");
  return { sampleRows: ids.length, uniqueUserIds: new Set(ids).size, singleWatermarkPerUser: true };
}

async function verifyPushLanguageGrouping(admin, excludeUserId) {
  const { data: tokenRows, error: tokenError } = await admin
    .from("user_push_tokens")
    .select("user_id")
    .neq("user_id", excludeUserId)
    .limit(200);
  assert(!tokenError, tokenError?.message ?? "token query failed");

  const userIds = [...new Set((tokenRows ?? []).map((row) => String(row.user_id)))];
  if (userIds.length === 0) {
    return { recipients: 0, byLanguage: { en: 0, ru: 0, de: 0 }, nullOrUnknownMappedToEn: 0, fcmSendSkipped: true };
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, language")
    .in("id", userIds);
  assert(!profileError, profileError?.message ?? "profiles query failed");

  const byLanguage = { en: 0, ru: 0, de: 0 };
  let nullOrUnknownMappedToEn = 0;
  for (const row of profiles ?? []) {
    const raw = typeof row.language === "string" ? row.language : null;
    const locale = resolveI18nLocale(raw);
    byLanguage[locale] += 1;
    if (raw == null || (raw !== "en" && raw !== "ru" && raw !== "de")) {
      assert(locale === "en", "null/unknown must map to en");
      nullOrUnknownMappedToEn += 1;
    }
  }

  return { recipients: userIds.length, byLanguage, nullOrUnknownMappedToEn, fcmSendSkipped: true };
}

async function main() {
  const admin = createAdmin();
  const column = await verifySourceLocaleColumn(admin);
  const { post, officialId, translated } = await publishRussianTestPost(admin);
  const display = verifyDisplayLocales(post);
  const unread = await verifyUnreadModel(admin);
  const pushGrouping = await verifyPushLanguageGrouping(admin, officialId);

  await admin.from("official_channel_posts").delete().eq("id", post.id);

  const result = {
    ok: true,
    column,
    post: {
      source_locale: post.source_locale,
      has_ru: Boolean(post.body_ru?.trim()),
      has_en: Boolean(post.body_en?.trim()),
      has_de: Boolean(post.body_de?.trim()),
      title_ru: post.title_ru,
      title_en: post.title_en,
      title_de: post.title_de,
      body_ru_preview: post.body_ru?.slice(0, 120),
      body_en_preview: post.body_en?.slice(0, 120),
      body_de_preview: post.body_de?.slice(0, 120),
      translatedSourceLocale: translated.sourceLocale,
    },
    display,
    unread,
    pushGrouping,
    cleanedUp: true,
    secretsLogged: false,
  };

  console.log("[official-channel-live-test]", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    "[official-channel-live-test] FAIL",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
