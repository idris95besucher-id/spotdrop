import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { resolveOfficialChannelUserId } from "@/lib/officialChannelAuth";
import { OFFICIAL_CHANNEL_MEDIA_BUCKET } from "@/lib/officialChannel";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function normalizePath(parts: string[]) {
  const joined = parts.map((part) => decodeURIComponent(part)).join("/");

  if (!joined || joined.includes("..") || joined.startsWith("/")) {
    return null;
  }

  return joined;
}

export async function GET(request: Request, context: RouteContext) {
  const userId = await resolveOfficialChannelUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const { path: pathParts } = await context.params;
  const imagePath = normalizePath(pathParts ?? []);

  if (!imagePath) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const { data: post, error: postError } = await admin
    .from("official_channel_posts")
    .select("id")
    .eq("image_path", imagePath)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();

  if (postError) {
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  if (!post?.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(OFFICIAL_CHANNEL_MEDIA_BUCKET)
    .createSignedUrl(imagePath, 120);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Unable to sign media URL." }, { status: 500 });
  }

  const accept = request.headers.get("accept") ?? "";

  if (accept.includes("application/json")) {
    return NextResponse.json({ url: signed.signedUrl });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
