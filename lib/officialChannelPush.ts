/**
 * Stage C: fan-out official channel push by profiles.language.
 * Groups recipients by app language (en/ru/de); null/unknown → en.
 * Does not create per-user notification rows or touch DM/group chats.
 */

import {
  resolveOfficialChannelLocalizedFields,
  type OfficialChannelLocaleSource,
} from "@/lib/officialChannelLocale";
import { resolveI18nLocale, type I18nLocale } from "@/lib/i18n/locales";
import { sendFcmToUser } from "@/lib/serverPushSend";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  defaultServerNotificationPreferences,
  shouldAllowPushForType,
  type ServerNotificationPreferences,
} from "@/lib/userNotificationPreferences";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const PUSH_TYPE = "official_channel";
const PUSH_HREF = "/official-channel";
const RECIPIENT_PAGE_SIZE = 500;
const SEND_CONCURRENCY = 8;

type PushRecipient = {
  userId: string;
  language: I18nLocale;
};

type JobCounts = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
};

function pushTitleAndBody(
  post: OfficialChannelLocaleSource,
  language: I18nLocale
): { title: string; body: string } {
  const fields = resolveOfficialChannelLocalizedFields(post, language);
  const title = fields.title?.trim() || "SpotDrop";
  const body = fields.body.trim();
  return { title, body };
}

async function loadPrefsMap(
  admin: AdminClient,
  userIds: string[]
): Promise<Map<string, ServerNotificationPreferences>> {
  const map = new Map<string, ServerNotificationPreferences>();

  if (userIds.length === 0) {
    return map;
  }

  const { data, error } = await admin
    .from("user_notification_preferences")
    .select(
      "user_id, all_enabled, direct_messages, group_messages, room_messages, likes, comments, new_followers, sound, vibration"
    )
    .in("user_id", userIds);

  if (error) {
    console.error("[official-channel-push] prefs load failed", error.message);
    return map;
  }

  for (const row of data ?? []) {
    map.set(String(row.user_id), {
      all_enabled: row.all_enabled !== false,
      direct_messages: row.direct_messages !== false,
      group_messages: row.group_messages !== false,
      room_messages: row.room_messages !== false,
      likes: row.likes !== false,
      comments: row.comments !== false,
      new_followers: row.new_followers !== false,
      sound: row.sound !== false,
      vibration: row.vibration !== false,
    });
  }

  return map;
}

async function loadRecipientsPage(
  admin: AdminClient,
  excludeUserId: string,
  afterUserId: string | null
): Promise<PushRecipient[]> {
  let tokenQuery = admin
    .from("user_push_tokens")
    .select("user_id")
    .neq("user_id", excludeUserId)
    .order("user_id", { ascending: true })
    .limit(RECIPIENT_PAGE_SIZE);

  if (afterUserId) {
    tokenQuery = tokenQuery.gt("user_id", afterUserId);
  }

  const { data: tokenRows, error: tokenError } = await tokenQuery;

  if (tokenError) {
    console.error("[official-channel-push] token page failed", tokenError.message);
    throw new Error("TOKEN_PAGE_FAILED");
  }

  const userIds = [
    ...new Set((tokenRows ?? []).map((row) => String(row.user_id)).filter(Boolean)),
  ];

  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, language")
    .in("id", userIds);

  if (profileError) {
    console.error("[official-channel-push] profiles load failed", profileError.message);
    throw new Error("PROFILES_PAGE_FAILED");
  }

  const languageByUser = new Map<string, I18nLocale>();

  for (const row of profiles ?? []) {
    languageByUser.set(
      String(row.id),
      resolveI18nLocale(
        typeof row.language === "string" ? row.language : null
      )
    );
  }

  return userIds.map((userId) => ({
    userId,
    language: languageByUser.get(userId) ?? "en",
  }));
}

async function claimPushJob(admin: AdminClient, postId: string) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("official_channel_push_jobs")
    .update({
      status: "running",
      started_at: now,
      updated_at: now,
      last_error: null,
    })
    .eq("post_id", postId)
    .eq("status", "pending")
    .select("id, post_id, attempt_count")
    .maybeSingle();

  if (error) {
    console.error("[official-channel-push] claim failed", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  await admin
    .from("official_channel_push_jobs")
    .update({
      attempt_count: (data.attempt_count ?? 0) + 1,
      updated_at: now,
    })
    .eq("id", data.id);

  return data as { id: string; post_id: string; attempt_count: number };
}

async function finishPushJob(
  admin: AdminClient,
  postId: string,
  counts: JobCounts,
  status: "completed" | "partial" | "failed",
  lastError: string | null
) {
  const now = new Date().toISOString();
  await admin
    .from("official_channel_push_jobs")
    .update({
      status,
      total_recipients: counts.total,
      sent_count: counts.sent,
      failed_count: counts.failed,
      skipped_count: counts.skipped,
      cursor_user_id: null,
      last_error: lastError,
      finished_at: now,
      updated_at: now,
    })
    .eq("post_id", postId);
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  let index = 0;

  async function next(): Promise<void> {
    const current = index;
    index += 1;

    if (current >= items.length) {
      return;
    }

    await worker(items[current]!);
    await next();
  }

  const starters = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    next()
  );
  await Promise.all(starters);
}

/**
 * Claim pending job for postId and send localized FCM pushes.
 * Safe to call after publish; no-ops if job is not pending.
 */
export async function processOfficialChannelPushJob(
  admin: AdminClient,
  postId: string
): Promise<void> {
  const claimed = await claimPushJob(admin, postId);

  if (!claimed) {
    return;
  }

  const { data: post, error: postError } = await admin
    .from("official_channel_posts")
    .select(
      "id, author_id, title_en, body_en, title_ru, body_ru, title_de, body_de, link_label_en, link_label_ru, link_label_de, source_locale, status"
    )
    .eq("id", postId)
    .maybeSingle();

  if (postError || !post || post.status !== "published") {
    await finishPushJob(
      admin,
      postId,
      { total: 0, sent: 0, failed: 0, skipped: 0 },
      "failed",
      postError?.message ?? "POST_NOT_FOUND"
    );
    return;
  }

  const localeSource = post as OfficialChannelLocaleSource;
  const authorId = String(post.author_id);
  const byLocale: Record<I18nLocale, { title: string; body: string }> = {
    en: pushTitleAndBody(localeSource, "en"),
    ru: pushTitleAndBody(localeSource, "ru"),
    de: pushTitleAndBody(localeSource, "de"),
  };

  const counts: JobCounts = { total: 0, sent: 0, failed: 0, skipped: 0 };
  let afterUserId: string | null = null;
  let lastError: string | null = null;

  try {
    for (;;) {
      const page = await loadRecipientsPage(admin, authorId, afterUserId);

      if (page.length === 0) {
        break;
      }

      counts.total += page.length;
      afterUserId = page[page.length - 1]!.userId;

      const prefsMap = await loadPrefsMap(
        admin,
        page.map((row) => row.userId)
      );

      await runPool(page, SEND_CONCURRENCY, async (recipient) => {
        const prefs =
          prefsMap.get(recipient.userId) ?? defaultServerNotificationPreferences();

        if (!shouldAllowPushForType(PUSH_TYPE, prefs)) {
          counts.skipped += 1;
          return;
        }

        const copy = byLocale[recipient.language];

        try {
          const result = await sendFcmToUser({
            admin,
            userId: recipient.userId,
            notification: null,
            title: copy.title,
            body: copy.body,
            href: PUSH_HREF,
            type: PUSH_TYPE,
            apnsSound: prefs.sound ? "default" : undefined,
            dataExtras: {
              post_id: postId,
            },
          });

          if (result.skipped === "no_tokens" || result.skipped === "fcm_not_configured") {
            counts.skipped += 1;
            return;
          }

          if (result.successCount > 0 || result.fcmSent > 0 || result.sent > 0) {
            counts.sent += 1;
            return;
          }

          counts.failed += 1;
          if (result.errors[0]?.message) {
            lastError = result.errors[0].message;
          }
        } catch (caught) {
          counts.failed += 1;
          lastError =
            caught instanceof Error ? caught.message : "SEND_FAILED";
        }
      });

      await admin
        .from("official_channel_push_jobs")
        .update({
          cursor_user_id: afterUserId,
          total_recipients: counts.total,
          sent_count: counts.sent,
          failed_count: counts.failed,
          skipped_count: counts.skipped,
          updated_at: new Date().toISOString(),
        })
        .eq("post_id", postId);

      if (page.length < RECIPIENT_PAGE_SIZE) {
        break;
      }
    }

    const status =
      counts.failed > 0 && counts.sent > 0
        ? "partial"
        : counts.failed > 0 && counts.sent === 0
          ? "failed"
          : "completed";

    await finishPushJob(admin, postId, counts, status, lastError);
  } catch (caught) {
    lastError = caught instanceof Error ? caught.message : "PUSH_JOB_FAILED";
    await finishPushJob(
      admin,
      postId,
      counts,
      counts.sent > 0 ? "partial" : "failed",
      lastError
    );
  }
}
