/**
 * Absolute origin for Next.js API routes when the app runs as a Capacitor
 * static export (no local `/api/*`). Prefer an explicit env, else derive from
 * the password-reset redirect host used in production.
 */

function isNativeOrLocalOrigin(origin: string) {
  return (
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://") ||
    origin.includes("localhost") ||
    origin === "null"
  );
}

export function getHostedApiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const resetRedirect = process.env.NEXT_PUBLIC_PASSWORD_RESET_REDIRECT_URL?.trim();

  if (resetRedirect) {
    try {
      return new URL(resetRedirect).origin;
    } catch {
      // fall through
    }
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin;

    if (origin && !isNativeOrLocalOrigin(origin)) {
      return origin.replace(/\/$/, "");
    }
  }

  return "https://spotdrop-five.vercel.app";
}
