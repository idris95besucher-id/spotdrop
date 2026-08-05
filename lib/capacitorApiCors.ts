import { NextResponse } from "next/server";
import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";

/**
 * Capacitor iOS WKWebView originates as `capacitor://localhost`. Hosted API
 * calls to the production Next origin are cross-origin and trigger CORS
 * preflight when Authorization (or other non-simple headers) are present.
 *
 * Never reflect `*` when Authorization is used — only an exact allowlisted origin.
 */

const CAPACITOR_ORIGIN = "capacitor://localhost";

function isDevelopmentRuntime() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "development" ||
    process.env.VERCEL_ENV === "preview"
  );
}

function productionWebOrigins(): string[] {
  const origins = new Set<string>();

  try {
    const hosted = getHostedApiBaseUrl().replace(/\/$/, "");
    if (hosted.startsWith("https://")) {
      origins.add(hosted);
    }
  } catch {
    // ignore
  }

  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (explicit) {
    try {
      const origin = new URL(explicit).origin;
      if (origin.startsWith("https://")) {
        origins.add(origin);
      }
    } catch {
      // ignore
    }
  }

  const resetRedirect = process.env.NEXT_PUBLIC_PASSWORD_RESET_REDIRECT_URL?.trim();
  if (resetRedirect) {
    try {
      const origin = new URL(resetRedirect).origin;
      if (origin.startsWith("https://")) {
        origins.add(origin);
      }
    } catch {
      // ignore
    }
  }

  // Canonical SpotDrop production web origin (fallback if env is unset).
  origins.add("https://spotdrop-five.vercel.app");

  return [...origins];
}

export function isAllowedCapacitorApiOrigin(origin: string): boolean {
  if (origin === CAPACITOR_ORIGIN) {
    return true;
  }

  if (productionWebOrigins().includes(origin.replace(/\/$/, ""))) {
    return true;
  }

  // Local browser / Capacitor dev only — never a production wildcard.
  if (
    isDevelopmentRuntime() &&
    (origin === "http://localhost" ||
      origin === "https://localhost" ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^https:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  ) {
    return true;
  }

  return false;
}

export function resolveCapacitorApiCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("origin")?.trim();
  if (!origin || !isAllowedCapacitorApiOrigin(origin)) {
    return null;
  }
  return origin;
}

export function applyCapacitorApiCors(
  request: Request,
  response: NextResponse
): NextResponse {
  const origin = resolveCapacitorApiCorsOrigin(request);
  if (!origin) {
    return response;
  }

  // Exact origin only — never `*`, especially with Authorization.
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "POST, DELETE, GET, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Request-Id"
  );
  response.headers.set("Access-Control-Expose-Headers", "X-Request-Id");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

/** Preflight: 204 with CORS headers, no auth. */
export function capacitorApiCorsPreflight(request: Request): NextResponse {
  return applyCapacitorApiCors(request, new NextResponse(null, { status: 204 }));
}

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveApiRequestId(request: Request): string {
  const fromHeader = request.headers.get("x-request-id")?.trim();
  if (fromHeader && REQUEST_ID_RE.test(fromHeader)) {
    return fromHeader;
  }
  return crypto.randomUUID();
}

export function jsonWithCapacitorApiCors(
  request: Request,
  requestId: string,
  body: Record<string, unknown>,
  init?: ResponseInit
): NextResponse {
  const response = NextResponse.json({ ...body, requestId }, init);
  response.headers.set("X-Request-Id", requestId);
  return applyCapacitorApiCors(request, response);
}
