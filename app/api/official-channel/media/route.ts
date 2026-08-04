import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  assertOfficialPublisher,
  resolveOfficialChannelUserId,
} from "@/lib/officialChannelAuth";
import {
  OFFICIAL_CHANNEL_ALLOWED_IMAGE_TYPES,
  OFFICIAL_CHANNEL_MAX_IMAGE_BYTES,
  OFFICIAL_CHANNEL_MEDIA_BUCKET,
} from "@/lib/officialChannel";

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

export async function POST(request: Request) {
  const userId = await resolveOfficialChannelUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const official = await assertOfficialPublisher(userId);

  if (official.error === "SERVICE_UNAVAILABLE" || !official.admin) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  if (!official.isOfficial) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > OFFICIAL_CHANNEL_MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 400 });
  }

  const mime = file.type.trim().toLowerCase();

  if (
    !(OFFICIAL_CHANNEL_ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)
  ) {
    return NextResponse.json({ error: "Only JPEG, PNG, and WebP are allowed." }, { status: 400 });
  }

  const ext = extensionForMime(mime);

  if (!ext) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }

  const imagePath = `${userId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await official.admin.storage
    .from(OFFICIAL_CHANNEL_MEDIA_BUCKET)
    .upload(imagePath, bytes, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    console.error("[official-channel/media] upload failed", uploadError);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  return NextResponse.json({ imagePath });
}

export async function DELETE(request: Request) {
  const userId = await resolveOfficialChannelUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const official = await assertOfficialPublisher(userId);

  if (official.error === "SERVICE_UNAVAILABLE" || !official.admin) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  if (!official.isOfficial) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { imagePath?: unknown } | null;
  const imagePath = typeof body?.imagePath === "string" ? body.imagePath.trim() : "";

  if (
    !imagePath ||
    imagePath.includes("..") ||
    imagePath.startsWith("/") ||
    !imagePath.startsWith(`${userId}/`)
  ) {
    return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
  }

  const { data: linked, error: linkedError } = await official.admin
    .from("official_channel_posts")
    .select("id")
    .eq("image_path", imagePath)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();

  if (linkedError) {
    return NextResponse.json({ error: "Unable to verify image usage." }, { status: 500 });
  }

  if (linked?.id) {
    return NextResponse.json(
      { error: "Published media cannot be deleted." },
      { status: 409 }
    );
  }

  const { error: removeError } = await official.admin.storage
    .from(OFFICIAL_CHANNEL_MEDIA_BUCKET)
    .remove([imagePath]);

  if (removeError) {
    console.error("[official-channel/media] delete failed", removeError);
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
