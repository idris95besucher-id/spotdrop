import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Called directly by a signed-in client via supabase.functions.invoke() —
// deployed WITH Supabase's default JWT verification (unlike the webhook-only
// generate-post-caption function), so an invalid/missing session is already
// rejected by the platform before this code runs.
//
// Caches by post_id + language, versioned against a hash of the source
// caption so an edited caption never serves a stale cached translation.
//
// supabase.functions.invoke() sends Authorization + Content-Type: application/json
// — both "non-simple" per the Fetch spec, so the browser/WebView always sends
// a CORS preflight OPTIONS request first. Without explicit handling here,
// that preflight falls into the normal handler body (no Authorization header
// on a preflight, so it hit the 401 branch below) with no CORS headers at
// all — which silently blocks the real request from ever being sent from
// the installed Capacitor app's capacitor://localhost origin. Never
// reflects an arbitrary Origin back (Authorization is in play) — only an
// exact allowlisted origin, same convention as lib/capacitorApiCors.ts.

const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost",
  "https://spotdrop-five.vercel.app",
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = { Vary: "Origin" };

  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "authorization, content-type, apikey, x-client-info";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

const SUPPORTED_LANGUAGES = new Set(["en", "ru", "de"]);

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "Russian",
  de: "German",
};

const RESPONSE_JSON_SCHEMA = {
  name: "caption_translation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      translatedText: { type: "string" },
    },
    required: ["translatedText"],
  },
} as const;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (request) => {
  const cors = corsHeaders(request);

  // Preflight: no auth, no body — just tell the browser/WebView this origin
  // and these headers/methods are allowed, so it proceeds with the real request.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const respond = (body: Record<string, unknown>, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      ...init,
      headers: { ...cors, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

  if (!supabaseUrl || !serviceRole || !anonKey || !openaiKey) {
    return respond({ error: "Missing Supabase or OpenAI config." }, { status: 503 });
  }

  // Platform JWT verification (this function is deployed WITHOUT
  // --no-verify-jwt) already rejected a missing/invalid session before this
  // code runs — this just resolves *who* the caller is, for the ownership
  // check below, since the DB queries afterward use the service role and
  // would otherwise bypass RLS entirely.
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return respond({ error: "Unauthorized." }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);

  if (userError || !userData.user?.id) {
    return respond({ error: "Unauthorized." }, { status: 401 });
  }

  const callerId = userData.user.id;

  let body: { postId?: string; language?: string };

  try {
    body = await request.json();
  } catch {
    return respond({ error: "Invalid body." }, { status: 400 });
  }

  const rawPostId = body.postId?.trim() ?? "";
  const language = body.language?.trim() ?? "";

  if (!rawPostId || !SUPPORTED_LANGUAGES.has(language)) {
    return respond({ error: "postId and a supported language are required." }, { status: 400 });
  }

  const postId = /^\d+$/.test(rawPostId) ? Number(rawPostId) : rawPostId;
  const admin = createClient(supabaseUrl, serviceRole);

  // Temporary diagnostic-only channel — reuses the existing dispatch log
  // table (already service_role-writable, no schema change). Never logs
  // the JWT/access token, the OpenAI key, or the caption text itself.
  const logFailure = async (reason: string, detail?: Record<string, unknown>) => {
    try {
      await admin.from("ai_caption_dispatch_log").insert({
        post_id: postId,
        stage: "translate_failed",
        detail: JSON.stringify({ reason, language, ...detail }).slice(0, 2000),
      });
    } catch {
      // best-effort only
    }
  };

  const { data: post, error: postError } = await admin
    .from("posts")
    .select("id, content, visibility, user_id")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    return respond({ error: postError.message }, { status: 500 });
  }

  if (!post) {
    await logFailure("post_not_found");
    return respond({ error: "Post not found." }, { status: 404 });
  }

  // Mirrors the post_caption_translations_select_public RLS policy — the
  // service-role client above bypasses RLS entirely, so this check is the
  // only thing standing between a private post's caption and any signed-in
  // caller who happens to know/guess its id.
  if (post.visibility !== "public" && post.user_id !== callerId) {
    await logFailure("not_owner_or_private", { visibility: post.visibility });
    return respond({ error: "Post not found." }, { status: 404 });
  }

  const caption = (post.content ?? "").toString().trim();

  if (!caption) {
    return respond({ translatedText: null });
  }

  // The canonical caption is always English — nothing to translate for "en".
  if (language === "en") {
    return respond({ translatedText: caption });
  }

  const sourceHash = await sha256Hex(caption);

  const { data: cached } = await admin
    .from("post_caption_translations")
    .select("translated_text, source_content_hash")
    .eq("post_id", postId)
    .eq("language", language)
    .maybeSingle();

  if (cached && cached.source_content_hash === sourceHash) {
    return respond({ translatedText: cached.translated_text, cached: true });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const targetLanguageName = LANGUAGE_NAMES[language] ?? language;
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
          {
            role: "system",
            content: `Translate the user's text into natural, everyday ${targetLanguageName}, in the same short, friendly caption style. Preserve the meaning and tone — do not add, remove, or explain anything. Respond with strict JSON only, matching the given schema.`,
          },
          { role: "user", content: caption },
        ],
        response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { code?: unknown; type?: unknown; param?: unknown };
      } | null;

      console.error("[translate-post-caption] OpenAI request failed", {
        status: response.status,
        postId: post.id,
        language,
      });
      await logFailure("openai_request_failed", {
        openaiStatus: response.status,
        openaiErrorCode: errorBody?.error?.code ?? null,
        openaiErrorType: errorBody?.error?.type ?? null,
        openaiErrorParam: errorBody?.error?.param ?? null,
      });
      return respond({ error: "openai_request_failed" }, { status: 502 });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content;
    let translatedText = "";

    if (rawContent) {
      try {
        const parsed = JSON.parse(rawContent) as { translatedText?: unknown };
        translatedText = typeof parsed.translatedText === "string" ? parsed.translatedText.trim() : "";
      } catch {
        translatedText = "";
      }
    }

    if (!translatedText) {
      console.error("[translate-post-caption] empty/unparseable translation", { postId: post.id, language });
      await logFailure("empty_translation", { rawContentPresent: Boolean(rawContent) });
      return respond({ error: "empty_translation" }, { status: 502 });
    }

    const { error: upsertError } = await admin.from("post_caption_translations").upsert(
      {
        post_id: postId,
        language,
        translated_text: translatedText,
        source_content_hash: sourceHash,
      },
      { onConflict: "post_id,language" }
    );

    if (upsertError) {
      // Non-fatal — the translation itself succeeded, just log the cache miss.
      console.error("[translate-post-caption] cache upsert failed", {
        postId: post.id,
        language,
        message: upsertError.message,
      });
    }

    return respond({ translatedText, cached: false });
  } catch (caughtError) {
    const isAbort = caughtError instanceof DOMException && caughtError.name === "AbortError";
    console.error("[translate-post-caption] request error", {
      postId: post.id,
      language,
      isAbort,
      message: caughtError instanceof Error ? caughtError.message : String(caughtError),
    });
    await logFailure(isAbort ? "timeout" : "exception", {
      message: caughtError instanceof Error ? caughtError.message : String(caughtError),
    });
    return respond({ error: isAbort ? "timeout" : "exception" }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
});
