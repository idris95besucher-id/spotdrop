import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";
import {
  normalizeOptionalHttpsUrl,
  requireEnglishBody,
  resolveOfficialChannelLocalizedFields,
  trimOptionalText,
  type OfficialChannelLocaleSource,
} from "@/lib/officialChannelLocale";
import { supabase } from "@/lib/supabaseClient";

export const OFFICIAL_CHANNEL_MEDIA_BUCKET = "official-channel-media";
export const OFFICIAL_CHANNEL_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OFFICIAL_CHANNEL_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const OFFICIAL_CHANNEL_MAX_TITLE_LENGTH = 200;
export const OFFICIAL_CHANNEL_MAX_BODY_LENGTH = 4000;
export const OFFICIAL_CHANNEL_MAX_LINK_LABEL_LENGTH = 80;

export type OfficialChannelPostStatus = "draft" | "published";

export type OfficialChannelPostRow = OfficialChannelLocaleSource & {
  id: string;
  author_id: string;
  status: OfficialChannelPostStatus;
  image_path: string | null;
  link_url: string | null;
  client_request_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OfficialChannelPublishInput = {
  clientRequestId: string;
  titleEn?: string | null;
  bodyEn: string;
  imagePath?: string | null;
  linkUrl?: string | null;
  linkLabelEn?: string | null;
};

export type OfficialChannelPublishResult = {
  post: OfficialChannelPostRow | null;
  error: string | null;
  status: number;
};

const POST_SELECT =
  "id, author_id, status, title_en, body_en, title_ru, body_ru, title_de, body_de, image_path, link_url, link_label_en, link_label_ru, link_label_de, client_request_id, published_at, created_at, updated_at";

export function officialChannelMediaApiPath(imagePath: string | null | undefined): string | null {
  if (!imagePath?.trim()) {
    return null;
  }

  const base = getHostedApiBaseUrl().replace(/\/$/, "");
  const segments = imagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/api/official-channel/media/${segments}`;
}

/** Authenticated short-lived signed URL for a published post image. */
export async function fetchOfficialChannelSignedMediaUrl(imagePath: string) {
  const apiPath = officialChannelMediaApiPath(imagePath);

  if (!apiPath) {
    return { url: null as string | null, error: "Missing image path." };
  }

  try {
    const { Authorization } = await authHeaders();
    const response = await fetch(apiPath, {
      headers: {
        Authorization,
        Accept: "application/json",
      },
    });
    const payload = (await response.json().catch(() => null)) as {
      url?: string;
      error?: string;
    } | null;

    if (!response.ok || !payload?.url) {
      return { url: null as string | null, error: payload?.error ?? "Media load failed." };
    }

    return { url: payload.url, error: null as string | null };
  } catch (caught) {
    return {
      url: null as string | null,
      error: caught instanceof Error ? caught.message : "Media load failed.",
    };
  }
}

export function hasOfficialChannelUnread(
  latestPublishedAt: string | null | undefined,
  lastReadAt: string | null | undefined
): boolean {
  if (!latestPublishedAt) {
    return false;
  }

  const publishedMs = Date.parse(latestPublishedAt);

  if (!Number.isFinite(publishedMs)) {
    return false;
  }

  if (!lastReadAt) {
    return true;
  }

  const readMs = Date.parse(lastReadAt);

  if (!Number.isFinite(readMs)) {
    return true;
  }

  return publishedMs > readMs;
}

export async function fetchOfficialChannelPosts(limit = 50) {
  const { data, error } = await supabase
    .from("official_channel_posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { posts: [] as OfficialChannelPostRow[], error: error.message };
  }

  return { posts: (data ?? []) as OfficialChannelPostRow[], error: null as string | null };
}

export async function fetchOfficialChannelLastReadAt(userId: string) {
  const { data, error } = await supabase
    .from("official_channel_reads")
    .select("last_read_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { lastReadAt: null as string | null, error: error.message };
  }

  const lastReadAt =
    typeof data?.last_read_at === "string" ? data.last_read_at : null;

  return { lastReadAt, error: null as string | null };
}

export async function fetchOfficialChannelUnreadState(userId: string) {
  const [{ data: latest, error: latestError }, readResult] = await Promise.all([
    supabase
      .from("official_channel_posts")
      .select("published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchOfficialChannelLastReadAt(userId),
  ]);

  if (latestError) {
    return { unread: false, error: latestError.message };
  }

  if (readResult.error) {
    return { unread: false, error: readResult.error };
  }

  const latestPublishedAt =
    typeof latest?.published_at === "string" ? latest.published_at : null;

  return {
    unread: hasOfficialChannelUnread(latestPublishedAt, readResult.lastReadAt),
    error: null as string | null,
  };
}

/**
 * Mark channel read up to the newest loaded post's published_at (server timestamps only).
 */
export async function markOfficialChannelReadUpTo(
  userId: string,
  publishedAt: string | null | undefined
) {
  if (!publishedAt) {
    return { error: null as string | null };
  }

  const publishedMs = Date.parse(publishedAt);

  if (!Number.isFinite(publishedMs)) {
    return { error: "Invalid published_at." };
  }

  const { lastReadAt } = await fetchOfficialChannelLastReadAt(userId);

  if (lastReadAt) {
    const readMs = Date.parse(lastReadAt);

    if (Number.isFinite(readMs) && readMs >= publishedMs) {
      return { error: null as string | null };
    }
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("official_channel_reads").upsert(
    {
      user_id: userId,
      last_read_at: publishedAt,
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );

  return { error: error?.message ?? null };
}

export function localizeOfficialChannelPost(
  post: OfficialChannelPostRow,
  language: string | null | undefined,
  openFallback: string
) {
  const fields = resolveOfficialChannelLocalizedFields(post, language);
  return {
    ...fields,
    linkLabel: post.link_url ? fields.linkLabel ?? openFallback : null,
    imagePath: post.image_path,
  };
}

export function validatePublishInput(input: OfficialChannelPublishInput) {
  const clientRequestId = input.clientRequestId?.trim();

  if (!clientRequestId || !/^[0-9a-f-]{36}$/i.test(clientRequestId)) {
    throw new Error("CLIENT_REQUEST_ID_REQUIRED");
  }

  return {
    client_request_id: clientRequestId,
    title_en: trimOptionalText(input.titleEn, OFFICIAL_CHANNEL_MAX_TITLE_LENGTH),
    body_en: requireEnglishBody(input.bodyEn, OFFICIAL_CHANNEL_MAX_BODY_LENGTH),
    image_path:
      typeof input.imagePath === "string" && input.imagePath.trim()
        ? input.imagePath.trim()
        : null,
    link_url: normalizeOptionalHttpsUrl(input.linkUrl ?? null),
    link_label_en: trimOptionalText(input.linkLabelEn, OFFICIAL_CHANNEL_MAX_LINK_LABEL_LENGTH),
  };
}

async function authHeaders() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    accessToken: session.access_token,
  };
}

export async function publishOfficialChannelPost(
  input: OfficialChannelPublishInput
): Promise<OfficialChannelPublishResult> {
  try {
    const { Authorization } = await authHeaders();
    const base = getHostedApiBaseUrl().replace(/\/$/, "");
    const response = await fetch(`${base}/api/official-channel/publish`, {
      method: "POST",
      headers: {
        Authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientRequestId: input.clientRequestId,
        titleEn: input.titleEn ?? null,
        bodyEn: input.bodyEn,
        imagePath: input.imagePath ?? null,
        linkUrl: input.linkUrl ?? null,
        linkLabelEn: input.linkLabelEn ?? null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      post?: OfficialChannelPostRow;
      error?: string;
    } | null;

    if (!response.ok) {
      return {
        post: null,
        error: payload?.error ?? "Publish failed.",
        status: response.status,
      };
    }

    return { post: payload?.post ?? null, error: null, status: response.status };
  } catch (caught) {
    return {
      post: null,
      error: caught instanceof Error ? caught.message : "Publish failed.",
      status: 0,
    };
  }
}

const OFFICIAL_CHANNEL_UPLOAD_TIMEOUT_MS = 30_000;

function sniffClientImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function extensionForClientMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Normalize photo-library Files for Capacitor/WKWebView:
 * read bytes once, attach an explicit MIME + filename so FormData is a real multipart body
 * (empty type / missing name is common on iOS and can stall or fail server parsing).
 */
async function prepareOfficialChannelUploadBlob(file: File | Blob): Promise<{
  blob: Blob;
  fileName: string;
  mime: string;
  size: number;
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const reported =
    typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
  const sniffed = sniffClientImageMime(bytes);
  const mime =
    (OFFICIAL_CHANNEL_ALLOWED_IMAGE_TYPES as readonly string[]).includes(reported)
      ? reported
      : sniffed;

  if (!mime) {
    throw new Error("Only JPEG, PNG, and WebP are allowed.");
  }

  const originalName =
    file instanceof File && typeof file.name === "string" && file.name.trim()
      ? file.name.trim()
      : `image.${extensionForClientMime(mime)}`;
  const fileName = /\.(jpe?g|png|webp)$/i.test(originalName)
    ? originalName
    : `${originalName.replace(/\.[^.]+$/, "") || "image"}.${extensionForClientMime(mime)}`;

  return {
    blob: new Blob([bytes], { type: mime }),
    fileName,
    mime,
    size: bytes.byteLength,
  };
}

export async function uploadOfficialChannelMedia(file: File | Blob) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OFFICIAL_CHANNEL_UPLOAD_TIMEOUT_MS);

  try {
    console.info("[official-channel-upload] start");
    const { Authorization } = await authHeaders();
    const prepared = await prepareOfficialChannelUploadBlob(file);
    console.info(
      `[official-channel-upload] prepared mime=${prepared.mime} size=${prepared.size} name=${prepared.fileName}`
    );

    const base = getHostedApiBaseUrl().replace(/\/$/, "");
    const form = new FormData();
    // Explicit filename is required for reliable multipart parsing on iOS / Vercel.
    form.append("file", prepared.blob, prepared.fileName);

    console.info(`[official-channel-upload] fetch ${base}/api/official-channel/media`);
    const response = await fetch(`${base}/api/official-channel/media`, {
      method: "POST",
      headers: { Authorization },
      body: form,
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as {
      imagePath?: string;
      error?: string;
    } | null;

    console.info(
      `[official-channel-upload] response status=${response.status} hasPath=${Boolean(payload?.imagePath)}`
    );

    if (!response.ok || !payload?.imagePath) {
      return {
        imagePath: null as string | null,
        error: payload?.error ?? "Upload failed.",
        status: response.status,
      };
    }

    return {
      imagePath: payload.imagePath,
      error: null as string | null,
      status: response.status,
    };
  } catch (caught) {
    const timedOut =
      (caught instanceof Error && caught.name === "AbortError") ||
      (typeof DOMException !== "undefined" &&
        caught instanceof DOMException &&
        caught.name === "AbortError");

    console.error(
      `[official-channel-upload] ${timedOut ? "timeout" : "failed"}`,
      caught instanceof Error ? caught.name : "unknown"
    );

    return {
      imagePath: null as string | null,
      error: timedOut
        ? "Image upload timed out. Please try again."
        : caught instanceof Error
          ? caught.message
          : "Upload failed.",
      status: timedOut ? 504 : 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function deleteOfficialChannelMedia(imagePath: string) {
  try {
    const { Authorization } = await authHeaders();
    const base = getHostedApiBaseUrl().replace(/\/$/, "");
    const response = await fetch(`${base}/api/official-channel/media`, {
      method: "DELETE",
      headers: {
        Authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imagePath }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      return { error: payload?.error ?? "Delete failed.", status: response.status };
    }

    return { error: null as string | null, status: response.status };
  } catch (caught) {
    return {
      error: caught instanceof Error ? caught.message : "Delete failed.",
      status: 0,
    };
  }
}
