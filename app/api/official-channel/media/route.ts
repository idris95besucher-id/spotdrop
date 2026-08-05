import { randomUUID } from "node:crypto";
import {
  assertOfficialPublisher,
  resolveOfficialChannelUserId,
} from "@/lib/officialChannelAuth";
import {
  OFFICIAL_CHANNEL_ALLOWED_IMAGE_TYPES,
  OFFICIAL_CHANNEL_MAX_IMAGE_BYTES,
  OFFICIAL_CHANNEL_MEDIA_BUCKET,
} from "@/lib/officialChannel";
import {
  capacitorApiCorsPreflight,
  jsonWithCapacitorApiCors,
  resolveApiRequestId,
} from "@/lib/capacitorApiCors";

export const runtime = "nodejs";
export const maxDuration = 60;

const FORMDATA_TIMEOUT_MS = 15_000;
const STORAGE_UPLOAD_TIMEOUT_MS = 25_000;
const TAG = "[official-channel/media]";

function extensionForMime(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

/** Duck-type File/Blob — `instanceof File` fails across undici/global realms on Vercel. */
function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number" &&
    typeof (value as Blob).type === "string"
  );
}

function sniffImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
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

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(label));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
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

  console.info(`${TAG} route entered requestId=${requestId}`);

  const userId = await resolveOfficialChannelUserId(request);

  if (!userId) {
    console.info(`${TAG} auth failed requestId=${requestId}`);
    return respond(
      { error: "Unauthorized.", code: "unauthorized" },
      { status: 401 }
    );
  }

  const official = await assertOfficialPublisher(userId);

  if (official.error === "SERVICE_UNAVAILABLE" || !official.admin) {
    console.info(`${TAG} service unavailable requestId=${requestId}`);
    return respond({ error: "Service unavailable." }, { status: 503 });
  }

  if (!official.isOfficial) {
    console.info(
      `${TAG} forbidden user=${userId.slice(0, 8)} requestId=${requestId}`
    );
    return respond({ error: "Forbidden." }, { status: 403 });
  }

  console.info(
    `${TAG} auth passed user=${userId.slice(0, 8)} requestId=${requestId}`
  );

  let form: FormData;

  try {
    form = await withTimeout(
      request.formData(),
      FORMDATA_TIMEOUT_MS,
      "FORMDATA_TIMEOUT"
    );
  } catch (caught) {
    const timedOut =
      caught instanceof Error && caught.message === "FORMDATA_TIMEOUT";
    console.error(
      `${TAG} formData ${timedOut ? "timeout" : "parse failed"} requestId=${requestId}`
    );
    return respond(
      {
        error: timedOut
          ? "Image upload timed out. Please try again."
          : "Invalid image.",
        code: timedOut ? "upload_timed_out" : "invalid_image",
      },
      { status: timedOut ? 504 : 400 }
    );
  }

  console.info(`${TAG} formData parsed requestId=${requestId}`);

  const entry = form.get("file");

  if (!isBlobLike(entry)) {
    console.info(
      `${TAG} missing file entry type=${typeof entry} requestId=${requestId}`
    );
    return respond(
      { error: "Invalid image.", code: "invalid_image" },
      { status: 400 }
    );
  }

  const file = entry;
  const reportedName =
    typeof (file as File).name === "string" && (file as File).name.trim()
      ? (file as File).name.trim()
      : "(unnamed)";
  const reportedMime = file.type.trim().toLowerCase();

  console.info(
    `${TAG} blob found mime=${reportedMime || "(empty)"} size=${file.size} name=${reportedName} requestId=${requestId}`
  );

  if (file.size <= 0 || file.size > OFFICIAL_CHANNEL_MAX_IMAGE_BYTES) {
    return respond(
      { error: "Invalid image.", code: "invalid_image" },
      { status: 400 }
    );
  }

  let bytes: Uint8Array;

  try {
    bytes = new Uint8Array(
      await withTimeout(
        file.arrayBuffer(),
        FORMDATA_TIMEOUT_MS,
        "ARRAYBUFFER_TIMEOUT"
      )
    );
  } catch (caught) {
    const timedOut =
      caught instanceof Error && caught.message === "ARRAYBUFFER_TIMEOUT";
    console.error(
      `${TAG} arrayBuffer ${timedOut ? "timeout" : "failed"} requestId=${requestId}`
    );
    return respond(
      {
        error: timedOut
          ? "Image upload timed out. Please try again."
          : "Invalid image.",
        code: timedOut ? "upload_timed_out" : "invalid_image",
      },
      { status: timedOut ? 504 : 400 }
    );
  }

  console.info(
    `${TAG} arrayBuffer read bytes=${bytes.byteLength} requestId=${requestId}`
  );

  const sniffed = sniffImageMime(bytes);
  const mime = (
    (OFFICIAL_CHANNEL_ALLOWED_IMAGE_TYPES as readonly string[]).includes(
      reportedMime
    )
      ? reportedMime
      : sniffed
  ) as string | null;

  if (
    !mime ||
    !(OFFICIAL_CHANNEL_ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)
  ) {
    console.info(
      `${TAG} unsupported mime reported=${reportedMime || "(empty)"} sniffed=${sniffed ?? "(none)"} requestId=${requestId}`
    );
    return respond(
      { error: "Invalid image.", code: "invalid_image" },
      { status: 400 }
    );
  }

  const ext = extensionForMime(mime);

  if (!ext) {
    return respond(
      { error: "Invalid image.", code: "invalid_image" },
      { status: 400 }
    );
  }

  console.info(
    `${TAG} bucket=${OFFICIAL_CHANNEL_MEDIA_BUCKET} requestId=${requestId}`
  );

  const imagePath = `${userId}/${randomUUID()}.${ext}`;
  console.info(
    `${TAG} storage.upload started path=${imagePath} mime=${mime} bytes=${bytes.byteLength} requestId=${requestId}`
  );

  try {
    const { error: uploadError } = await withTimeout(
      official.admin.storage
        .from(OFFICIAL_CHANNEL_MEDIA_BUCKET)
        .upload(imagePath, bytes, {
          contentType: mime,
          upsert: false,
          cacheControl: "3600",
        }),
      STORAGE_UPLOAD_TIMEOUT_MS,
      "STORAGE_TIMEOUT"
    );

    if (uploadError) {
      console.error(`${TAG} storage.upload failed requestId=${requestId}`, {
        message: uploadError.message,
        name: uploadError.name,
      });
      return respond(
        {
          error: "Storage upload failed.",
          code: "storage_upload_failed",
        },
        { status: 500 }
      );
    }
  } catch (caught) {
    const timedOut =
      caught instanceof Error && caught.message === "STORAGE_TIMEOUT";
    console.error(
      `${TAG} storage.upload ${timedOut ? "timeout" : "threw"} requestId=${requestId}`
    );
    return respond(
      {
        error: timedOut
          ? "Image upload timed out. Please try again."
          : "Storage upload failed.",
        code: timedOut ? "upload_timed_out" : "storage_upload_failed",
      },
      { status: timedOut ? 504 : 500 }
    );
  }

  console.info(
    `${TAG} storage.upload completed path=${imagePath} requestId=${requestId}`
  );
  console.info(`${TAG} json response sent ok requestId=${requestId}`);
  return respond({ imagePath, code: "ok" });
}

export async function DELETE(request: Request) {
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

  const body = (await request.json().catch(() => null)) as {
    imagePath?: unknown;
  } | null;
  const imagePath =
    typeof body?.imagePath === "string" ? body.imagePath.trim() : "";

  if (
    !imagePath ||
    imagePath.includes("..") ||
    imagePath.startsWith("/") ||
    !imagePath.startsWith(`${userId}/`)
  ) {
    return respond(
      { error: "Invalid image path.", code: "invalid_image" },
      { status: 400 }
    );
  }

  const { data: linked, error: linkedError } = await official.admin
    .from("official_channel_posts")
    .select("id")
    .eq("image_path", imagePath)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();

  if (linkedError) {
    return respond(
      { error: "Unable to verify image usage." },
      { status: 500 }
    );
  }

  if (linked?.id) {
    return respond(
      { error: "Published media cannot be deleted." },
      { status: 409 }
    );
  }

  const { error: removeError } = await official.admin.storage
    .from(OFFICIAL_CHANNEL_MEDIA_BUCKET)
    .remove([imagePath]);

  if (removeError) {
    console.error(`${TAG} delete failed requestId=${requestId}`, {
      message: removeError.message,
    });
    return respond({ error: "Delete failed." }, { status: 500 });
  }

  return respond({ ok: true });
}
