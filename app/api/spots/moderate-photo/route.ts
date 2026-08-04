import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// A single OpenAI vision call typically finishes in a few seconds, but this
// gives headroom over the platform default for a cold start / slow network.
export const maxDuration = 30;

const POST_MEDIA_BUCKET = "post-media";

const OPENAI_MODERATION_SYSTEM_PROMPT = `You moderate photos for SpotDrop's Public Spots — a place where users publish photos of places other people can visit: beautiful natural places, cities and streets, cafes and restaurants, shops, landmarks, buildings, viewpoints, roads, and other useful visitable locations.

Classify the photo's main subject as exactly one of:
- "place" — the main subject is a visitable place. People who are far away, small in the frame, or only incidentally present are fine — the place still reads as the main subject.
- "person" — the main subject is a person: a selfie or mirror selfie, a portrait of one person, a group photo of people, a photo mainly of a person's body, or a person taking up a significant part of the frame with the place reduced to a background.
- "uncertain" — you genuinely cannot tell which of the above applies.

Respond with strict JSON only, matching the given schema.`;

const RESPONSE_JSON_SCHEMA = {
  name: "spot_photo_check",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: { type: "string", enum: ["place", "person", "uncertain"] },
    },
    required: ["decision"],
  },
} as const;

const ALLOWED_DECISIONS = new Set(["place", "person", "uncertain"]);

async function resolveAuthenticatedUserId(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user?.id) {
    return null;
  }

  return data.user.id;
}

/**
 * Only allow Vision to fetch an object the caller just uploaded into our
 * public post-media bucket under their own userId prefix. Rejects arbitrary
 * external URLs and other users' objects. Client-supplied decision /
 * moderationPassed fields are ignored — the server always decides.
 */
function resolveOwnedPostMediaImageUrl(rawImageUrl: string, userId: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!supabaseUrl) {
    return null;
  }

  let parsed: URL;
  let projectOrigin: string;

  try {
    parsed = new URL(rawImageUrl);
    projectOrigin = new URL(supabaseUrl).origin;
  } catch {
    return null;
  }

  if (parsed.origin !== projectOrigin) {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const marker = `/storage/v1/object/public/${POST_MEDIA_BUCKET}/`;
  const markerIndex = parsed.pathname.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  let storagePath: string;

  try {
    storagePath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }

  if (!storagePath || storagePath.includes("..") || storagePath.includes("//") || storagePath.startsWith("/")) {
    return null;
  }

  // Uploads use `${userId}/image-...` (lib/postMedia.ts formatPostMediaPath).
  if (!storagePath.startsWith(`${userId}/`)) {
    return null;
  }

  // Strip query/hash so OpenAI fetches the public object path we validated.
  return `${projectOrigin}${parsed.pathname}`;
}

export async function POST(request: Request) {
  const userId = await resolveAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rawImageUrl: string | null = null;

  try {
    // Intentionally read only imageUrl. Any client-supplied decision /
    // moderationPassed / outcome fields are ignored and cannot bypass Vision.
    const body = (await request.json()) as { imageUrl?: unknown };
    rawImageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : null;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!rawImageUrl) {
    return NextResponse.json({ error: "imageUrl is required." }, { status: 400 });
  }

  const imageUrl = resolveOwnedPostMediaImageUrl(rawImageUrl, userId);

  if (!imageUrl) {
    console.error("[spot-photo-moderation] rejected imageUrl", { userId });
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    console.error("[spot-photo-moderation] OPENAI_API_KEY not configured");
    return NextResponse.json({ error: "Photo check is temporarily unavailable." }, { status: 503 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

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
          { role: "system", content: OPENAI_MODERATION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      console.error("[spot-photo-moderation] OpenAI request failed", {
        status: response.status,
        userId,
      });
      return NextResponse.json({ error: "Photo check failed. Please try again." }, { status: 502 });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.error("[spot-photo-moderation] OpenAI response missing content", { userId });
      return NextResponse.json({ error: "Photo check failed. Please try again." }, { status: 502 });
    }

    let parsed: { decision?: unknown };

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("[spot-photo-moderation] Unable to parse OpenAI response JSON", { userId });
      return NextResponse.json({ error: "Photo check failed. Please try again." }, { status: 502 });
    }

    // Structured Outputs should already guarantee this shape — re-validate anyway,
    // fail closed (treat as a technical error, never silently publish) on anything
    // unexpected.
    const decision = typeof parsed.decision === "string" ? parsed.decision : null;

    if (!decision || !ALLOWED_DECISIONS.has(decision)) {
      console.error("[spot-photo-moderation] OpenAI response failed validation", { userId, decision });
      return NextResponse.json({ error: "Photo check failed. Please try again." }, { status: 502 });
    }

    console.log("[spot-photo-moderation] result", { userId, decision });

    return NextResponse.json({ decision });
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    console.error("[spot-photo-moderation] request error", {
      userId,
      isAbort,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: isAbort ? "Photo check timed out. Please try again." : "Photo check failed. Please try again." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
