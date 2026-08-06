import {
  assertOfficialPublisher,
  resolveOfficialChannelUserId,
} from "@/lib/officialChannelAuth";
import {
  OFFICIAL_CHANNEL_MEDIA_BUCKET,
  validatePublishInput,
  type OfficialChannelPostRow,
} from "@/lib/officialChannel";
import { processOfficialChannelPushJob } from "@/lib/officialChannelPush";
import {
  OfficialChannelTranslationError,
  translateOfficialChannelAnnouncement,
} from "@/lib/officialChannelTranslation";
import {
  capacitorApiCorsPreflight,
  jsonWithCapacitorApiCors,
  resolveApiRequestId,
} from "@/lib/capacitorApiCors";

export const maxDuration = 60;

const POST_SELECT =
  "id, author_id, status, source_locale, title_en, body_en, title_ru, body_ru, title_de, body_de, image_path, link_url, link_label_en, link_label_ru, link_label_de, client_request_id, published_at, created_at, updated_at";

const TRANSLATION_FAILED_MESSAGE =
  "Automatic translation failed. Please try again.";

function mapValidationError(code: string) {
  switch (code) {
    case "BODY_REQUIRED":
    case "BODY_EN_REQUIRED":
      return "Announcement text is required.";
    case "INVALID_LINK_URL":
      return "Link must be a valid https URL.";
    case "TEXT_TOO_LONG":
      return "One of the text fields is too long.";
    case "CLIENT_REQUEST_ID_REQUIRED":
      return "Missing idempotency key.";
    default:
      return "Invalid publish payload.";
  }
}

async function ensurePendingPushJob(
  admin: NonNullable<Awaited<ReturnType<typeof assertOfficialPublisher>>["admin"]>,
  postId: string
) {
  const { error: jobError } = await admin.from("official_channel_push_jobs").upsert(
    {
      post_id: postId,
      status: "pending",
      total_recipients: 0,
      sent_count: 0,
      failed_count: 0,
      skipped_count: 0,
      attempt_count: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "post_id", ignoreDuplicates: true }
  );

  if (jobError) {
    console.error("[official-channel/publish] push job insert failed", jobError);
  }
}

export async function OPTIONS(request: Request) {
  return capacitorApiCorsPreflight(request);
}

export async function POST(request: Request) {
  const requestId = resolveApiRequestId(request);
  const respond = (
    body: Record<string, unknown>,
    init?: ResponseInit
  ) => jsonWithCapacitorApiCors(request, requestId, body, init);

  const userId = await resolveOfficialChannelUserId(request);

  if (!userId) {
    return respond(
      { error: "Unauthorized.", code: "unauthorized" },
      { status: 401 }
    );
  }

  const official = await assertOfficialPublisher(userId);

  if (official.error === "SERVICE_UNAVAILABLE" || !official.admin) {
    return respond({ error: "Service unavailable." }, { status: 503 });
  }

  if (!official.isOfficial) {
    return respond({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!body) {
    return respond({ error: "Invalid JSON body." }, { status: 400 });
  }

  let validated;

  try {
    // Source may be en/ru/de — server detects locale and fills the other two.
    validated = validatePublishInput({
      clientRequestId: String(body.clientRequestId ?? ""),
      title: (body.title as string | null) ?? (body.titleEn as string | null) ?? null,
      body: String(body.body ?? body.bodyEn ?? ""),
      imagePath: (body.imagePath as string | null) ?? null,
      linkUrl: (body.linkUrl as string | null) ?? null,
      linkLabel:
        (body.linkLabel as string | null) ?? (body.linkLabelEn as string | null) ?? null,
    });
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : "INVALID";
    return respond({ error: mapValidationError(code) }, { status: 400 });
  }

  // Idempotency: return existing post without re-translating or re-sending push.
  const { data: existingBeforeTranslate, error: existingLookupError } =
    await official.admin
      .from("official_channel_posts")
      .select(POST_SELECT)
      .eq("author_id", userId)
      .eq("client_request_id", validated.client_request_id)
      .maybeSingle();

  if (existingLookupError) {
    console.error(
      `[official-channel/publish] idempotency lookup failed requestId=${requestId}`
    );
    return respond({ error: "Publish failed." }, { status: 500 });
  }

  if (existingBeforeTranslate) {
    const existingPost = existingBeforeTranslate as OfficialChannelPostRow;
    return respond({ post: existingPost });
  }

  if (validated.image_path) {
    if (
      validated.image_path.includes("..") ||
      validated.image_path.startsWith("/") ||
      !validated.image_path.startsWith(`${userId}/`)
    ) {
      return respond({ error: "Invalid image path." }, { status: 400 });
    }

    const { error: signError } = await official.admin.storage
      .from(OFFICIAL_CHANNEL_MEDIA_BUCKET)
      .createSignedUrl(validated.image_path, 60);

    if (signError) {
      return respond({ error: "Image not found." }, { status: 400 });
    }
  }

  let translated;

  try {
    translated = await translateOfficialChannelAnnouncement({
      title: validated.title,
      body: validated.body,
      linkLabel: validated.link_label,
    });
  } catch (caught) {
    if (!(caught instanceof OfficialChannelTranslationError)) {
      console.error(
        `[official-channel/publish] unexpected translation error requestId=${requestId}`
      );
    }
    return respond({ error: TRANSLATION_FAILED_MESSAGE }, { status: 502 });
  }

  const publishedAt = new Date().toISOString();
  const insertRow = {
    author_id: userId,
    status: "published" as const,
    client_request_id: validated.client_request_id,
    source_locale: translated.sourceLocale,
    title_en: translated.en.title,
    body_en: translated.en.body,
    title_ru: translated.ru.title,
    body_ru: translated.ru.body,
    title_de: translated.de.title,
    body_de: translated.de.body,
    image_path: validated.image_path,
    link_url: validated.link_url,
    link_label_en: translated.en.linkLabel,
    link_label_ru: translated.ru.linkLabel,
    link_label_de: translated.de.linkLabel,
    published_at: publishedAt,
    updated_at: publishedAt,
  };

  const { data: inserted, error: insertError } = await official.admin
    .from("official_channel_posts")
    .insert(insertRow)
    .select(POST_SELECT)
    .maybeSingle();

  let post = inserted as OfficialChannelPostRow | null;
  let isNewPost = Boolean(inserted);

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing, error: existingError } = await official.admin
        .from("official_channel_posts")
        .select(POST_SELECT)
        .eq("author_id", userId)
        .eq("client_request_id", validated.client_request_id)
        .maybeSingle();

      if (existingError || !existing) {
        return respond({ error: "Publish conflict." }, { status: 409 });
      }

      post = existing as OfficialChannelPostRow;
      isNewPost = false;
    } else {
      console.error(
        `[official-channel/publish] insert failed requestId=${requestId}`
      );
      return respond({ error: "Publish failed." }, { status: 500 });
    }
  }

  if (!post) {
    return respond({ error: "Publish failed." }, { status: 500 });
  }

  if (isNewPost) {
    await ensurePendingPushJob(official.admin, post.id);
    // Stage C: fan-out localized push by profiles.language (best-effort).
    try {
      await processOfficialChannelPushJob(official.admin, post.id);
    } catch (caught) {
      console.error(
        `[official-channel/publish] push fan-out failed requestId=${requestId}`,
        caught instanceof Error ? caught.message : "unknown"
      );
    }
  }

  return respond({ post });
}
