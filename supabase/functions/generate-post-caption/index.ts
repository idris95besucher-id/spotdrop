import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Triggered two ways: (1) the `trg_dispatch_ai_caption_job` Postgres trigger
// (database/add-ai-post-captions.sql) right after a Spot with
// caption_source = 'ai_pending' is inserted, and (2) the retry-stale-captions
// sweep re-dispatching a post that's been stuck in 'ai_pending' too long
// (app/api/posts/retry-stale-captions/route.ts). Both call this same
// function the same way — it doesn't know or care which one triggered it,
// and both may legitimately race each other for the same post.
//
// Never blocks or fails the publish itself. Bounded, idempotent, and
// concurrency-safe: every attempt is gated by a processing LEASE
// (acquire_ai_caption_lease() in the DB), identified by a UUID token unique
// to this invocation. Only the current lease holder may call OpenAI — a
// second concurrent delivery for the same post is refused before it ever
// reaches the network call, not just before the final write. Capped at
// MAX_CAPTION_ATTEMPTS total. Only 429 / 5xx / timeout / network errors are
// retried; anything else (no image, ineligible post, empty/unparseable
// model output) fails immediately without consuming further attempts.

const CAPTION_MAX_LENGTH = 500;
const MAX_CAPTION_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const OPENAI_TIMEOUT_MS = 20_000;

const CAPTION_SYSTEM_PROMPT = `You write short, natural captions for SpotDrop — a social travel app where people share photos and videos of real places: natural spots, city streets, cafes, viewpoints, landmarks, and other visitable locations.

Write ONE short, natural English caption for the place shown in the image, in the style of a friendly travel/social post. Usually one sentence, at most two short sentences.

Rules:
- English only, regardless of any other language you see in the image.
- Describe only what is visibly true in the image, or clearly stated in the optional place context you're given (name/city/country) — never invent facts, history, or names you weren't given.
- Tone: natural, friendly, useful — never robotic, salesy, or exaggerated.
- No emojis. No hashtags.
- If people are visible, describe the place and scene only — never describe or guess anything about the people themselves.
- If you cannot tell what the place is well enough to write something true and useful, write a brief, honest, generic caption about the scene (e.g. "A quiet spot worth a look.") rather than guessing details.

Respond with strict JSON only, matching the given schema.`;

const RESPONSE_JSON_SCHEMA = {
  name: "spot_caption",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      caption: { type: "string" },
    },
    required: ["caption"],
  },
} as const;

type PostRow = {
  id: number | string;
  caption_source: string | null;
  visibility: string | null;
  published_to_spots: boolean | null;
  media_type: string | null;
  image_url: string | null;
  video_cover_url: string | null;
  thumbnail_url: string | null;
  spot_name: string | null;
  spot_city: string | null;
  spot_country: string | null;
};

type LeaseResult = {
  acquired: boolean;
  attempts: number;
  exhausted: boolean;
};

type CaptionResult =
  | { ok: true; caption: string }
  | { ok: false; retryable: boolean; reason: string };

function buildPlaceContext(post: PostRow): string | null {
  const parts: string[] = [];

  if (post.spot_name?.trim()) parts.push(`Place name: ${post.spot_name.trim()}`);
  if (post.spot_city?.trim()) parts.push(`City: ${post.spot_city.trim()}`);
  if (post.spot_country?.trim()) parts.push(`Country: ${post.spot_country.trim()}`);

  return parts.length ? parts.join("\n") : null;
}

/** Video: use the already-generated poster/thumbnail, never the raw video file. */
function resolveImageUrl(post: PostRow): string | null {
  if (post.media_type === "video") {
    return post.video_cover_url?.trim() || post.thumbnail_url?.trim() || null;
  }

  return post.image_url?.trim() || null;
}

function isRetryableStatus(status: number) {
  return status === 429 || (status >= 500 && status < 600);
}

/** One OpenAI attempt. Classifies failures so the caller knows whether to retry. */
async function requestCaptionFromOpenAI(
  imageUrl: string,
  placeContext: string | null,
  openaiKey: string
): Promise<CaptionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: CAPTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              ...(placeContext ? [{ type: "text", text: placeContext }] : []),
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      // Diagnostic-only: OpenAI's error body identifies the failure without
      // ever including the request payload, the image URL, or our
      // credentials. Does not change the returned CaptionResult/retry
      // behavior below.
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { code?: unknown; type?: unknown; param?: unknown; message?: unknown };
      } | null;

      console.error("[generate-post-caption] OpenAI request failed", {
        status: response.status,
        openaiErrorCode: errorBody?.error?.code ?? null,
        openaiErrorType: errorBody?.error?.type ?? null,
        openaiErrorParam: errorBody?.error?.param ?? null,
        openaiErrorMessage: errorBody?.error?.message ?? null,
      });

      return { ok: false, retryable: isRetryableStatus(response.status), reason: `http_${response.status}` };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content;
    let caption = "";

    if (rawContent) {
      try {
        const parsed = JSON.parse(rawContent) as { caption?: unknown };
        caption = typeof parsed.caption === "string" ? parsed.caption.trim() : "";
      } catch {
        caption = "";
      }
    }

    caption = caption.slice(0, CAPTION_MAX_LENGTH);

    if (!caption) {
      // A malformed/empty body despite a 200 + structured output isn't a
      // network/rate-limit issue — not one of the transient categories we retry.
      return { ok: false, retryable: false, reason: "empty_caption" };
    }

    return { ok: true, caption };
  } catch (caughtError) {
    const isAbort = caughtError instanceof DOMException && caughtError.name === "AbortError";
    return { ok: false, retryable: true, reason: isAbort ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (request) => {
  const secret = Deno.env.get("AI_CAPTION_WEBHOOK_SECRET") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

  if (!supabaseUrl || !serviceRole || !openaiKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase or OpenAI config." }), { status: 503 });
  }

  let body: { postId?: string };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body." }), { status: 400 });
  }

  const rawPostId = body.postId?.trim() ?? "";

  if (!rawPostId) {
    return new Response(JSON.stringify({ error: "postId required." }), { status: 400 });
  }

  const postId = /^\d+$/.test(rawPostId) ? Number(rawPostId) : rawPostId;
  const admin = createClient(supabaseUrl, serviceRole);

  const { data: post, error } = await admin
    .from("posts")
    .select(
      "id, caption_source, visibility, published_to_spots, media_type, image_url, video_cover_url, thumbnail_url, spot_name, spot_city, spot_country"
    )
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!post) {
    return new Response(JSON.stringify({ error: "Post not found." }), { status: 404 });
  }

  const row = post as PostRow;

  // The user may have already saved a manual caption (or a prior attempt
  // already succeeded/failed) between dispatch and this execution — never
  // overwrite, and never spend an attempt on a post that's already resolved.
  if (row.caption_source !== "ai_pending") {
    console.log("[generate-post-caption] skipped, caption_source changed", {
      postId: row.id,
      caption_source: row.caption_source,
    });
    return new Response(JSON.stringify({ skipped: "caption_source_changed" }), { status: 200 });
  }

  // Re-verify eligibility server-side — never trust that the client that
  // published this Spot actually enforced the public-Spots-only scope
  // (lib/spots.ts) before setting caption_source = 'ai_pending'. This is a
  // permanent condition (won't change on retry), so fail without claiming
  // an attempt or calling OpenAI.
  if (row.visibility !== "public" || row.published_to_spots !== true) {
    console.warn("[generate-post-caption] post not eligible for auto-caption", {
      postId: row.id,
      visibility: row.visibility,
      publishedToSpots: row.published_to_spots,
    });
    await admin
      .from("posts")
      .update({ caption_source: "ai_failed" })
      .eq("id", postId)
      .eq("caption_source", "ai_pending");
    return new Response(JSON.stringify({ error: "not_eligible" }), { status: 200 });
  }

  const imageUrl = resolveImageUrl(row);

  if (!imageUrl) {
    // Also permanent — no poster/image will appear on retry — fail without
    // claiming an attempt.
    await admin
      .from("posts")
      .update({ caption_source: "ai_failed" })
      .eq("id", postId)
      .eq("caption_source", "ai_pending");

    console.warn("[generate-post-caption] no image URL available", { postId: row.id });
    return new Response(JSON.stringify({ error: "no_image" }), { status: 200 });
  }

  const placeContext = buildPlaceContext(row);
  // Unique to this invocation. Renewed (not replaced) across this
  // invocation's own internal retries below — a concurrent delivery with a
  // DIFFERENT token is refused by acquire_ai_caption_lease() while this
  // token's lease is still live, which is what stops two overlapping
  // deliveries from both calling OpenAI for the same post.
  const leaseToken = crypto.randomUUID();
  let backoffMs = RETRY_BASE_DELAY_MS;

  for (let iteration = 0; iteration < MAX_CAPTION_ATTEMPTS; iteration++) {
    const { data: leaseData, error: leaseError } = await admin.rpc("acquire_ai_caption_lease", {
      p_post_id: postId,
      p_lease_token: leaseToken,
      p_max_attempts: MAX_CAPTION_ATTEMPTS,
    });

    if (leaseError) {
      console.error("[generate-post-caption] acquire_ai_caption_lease failed", {
        postId: row.id,
        message: leaseError.message,
      });
      return new Response(JSON.stringify({ error: "lease_failed" }), { status: 500 });
    }

    const lease = (Array.isArray(leaseData) ? leaseData[0] : leaseData) as LeaseResult | undefined;

    if (!lease?.acquired) {
      // Either already resolved (manual edit / a prior invocation already
      // succeeded or failed), attempts exhausted (the RPC already marked
      // ai_failed in that case), or — the case this whole mechanism exists
      // for — a DIFFERENT invocation currently holds a live lease and is
      // actively calling OpenAI right now. Either way: do not call OpenAI.
      console.log("[generate-post-caption] lease not acquired", {
        postId: row.id,
        exhausted: lease?.exhausted ?? false,
      });
      return new Response(
        JSON.stringify({ skipped: lease?.exhausted ? "attempts_exhausted" : "not_leaseable" }),
        { status: 200 }
      );
    }

    const result = await requestCaptionFromOpenAI(imageUrl, placeContext, openaiKey);

    if (result.ok) {
      // Guarded write-back: only applies if nothing changed caption_source
      // since this attempt was claimed (e.g. the user hasn't since saved a
      // manual caption). Also releases the lease — harmless either way once
      // caption_source has left 'ai_pending', but keeps the row's lease
      // fields clean.
      const { data: updated } = await admin
        .from("posts")
        .update({
          content: result.caption,
          caption_source: "ai",
          caption_lease_token: null,
          caption_lease_expires_at: null,
        })
        .eq("id", postId)
        .eq("caption_source", "ai_pending")
        .select("id")
        .maybeSingle();

      console.log("[generate-post-caption] done", {
        postId: row.id,
        applied: Boolean(updated),
        attempt: lease.attempts,
        captionLength: result.caption.length,
      });

      return new Response(
        JSON.stringify({ ok: true, applied: Boolean(updated), attempts: lease.attempts }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    console.warn("[generate-post-caption] attempt failed", {
      postId: row.id,
      attempt: lease.attempts,
      reason: result.reason,
      retryable: result.retryable,
    });

    if (!result.retryable) {
      await admin
        .from("posts")
        .update({ caption_source: "ai_failed", caption_lease_token: null, caption_lease_expires_at: null })
        .eq("id", postId)
        .eq("caption_source", "ai_pending");

      return new Response(JSON.stringify({ error: result.reason }), { status: 200 });
    }

    if (lease.attempts >= MAX_CAPTION_ATTEMPTS) {
      // Budget exhausted on a retryable failure — close it out now rather
      // than loop again just to have the next lease attempt mark it failed.
      await admin
        .from("posts")
        .update({ caption_source: "ai_failed", caption_lease_token: null, caption_lease_expires_at: null })
        .eq("id", postId)
        .eq("caption_source", "ai_pending");

      return new Response(JSON.stringify({ error: `${result.reason}_exhausted` }), { status: 200 });
    }

    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    backoffMs *= 2;
  }

  // Unreachable in practice — every branch above returns — but guarantees a
  // response instead of silently falling through.
  return new Response(JSON.stringify({ error: "unexpected_exit" }), { status: 500 });
});
