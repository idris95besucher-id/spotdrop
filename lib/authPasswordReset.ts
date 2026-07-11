import { RESET_LINK_INVALID_MESSAGE } from "@/lib/authMessages";
import { clearLocalAuthSession } from "@/lib/authSession";
import { PASSWORD_RECOVERY_SESSION_KEY } from "@/lib/passwordRecoveryBootstrap";
import { supabase } from "@/lib/supabaseClient";

/** Temporary debug logging for password recovery — remove when stable. */
const RECOVERY_DEBUG = true;

function recoveryLog(label: string, payload?: unknown) {
  if (!RECOVERY_DEBUG || typeof window === "undefined") {
    return;
  }

  if (payload === undefined) {
    console.log(`[SpotDrop recovery] ${label}`);
    return;
  }

  console.log(`[SpotDrop recovery] ${label}`, payload);
}

/** Must match Supabase Auth → URL Configuration → Redirect URLs allow list. */
export const PASSWORD_RESET_REDIRECT_URL =
  process.env.NEXT_PUBLIC_PASSWORD_RESET_REDIRECT_URL ??
  "https://spotdrop-five.vercel.app/auth/reset-password";

function isNativeOrLocalOrigin(origin: string) {
  return (
    origin.startsWith("capacitor://") ||
    origin.startsWith("ionic://") ||
    origin.includes("localhost") ||
    origin === "null"
  );
}

export function getPasswordResetRedirectUrl() {
  const envRedirect = process.env.NEXT_PUBLIC_PASSWORD_RESET_REDIRECT_URL?.trim();

  if (envRedirect) {
    return envRedirect;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin;

    if (origin && !isNativeOrLocalOrigin(origin)) {
      return `${origin.replace(/\/$/, "")}/auth/reset-password`;
    }
  }

  return PASSWORD_RESET_REDIRECT_URL;
}

export function validatePasswordResetRedirectUrl(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return {
        valid: false as const,
        reason: `redirectTo must use https (got ${parsed.protocol})`,
      };
    }

    if (!parsed.pathname.includes("reset-password")) {
      return {
        valid: false as const,
        reason: "redirectTo path should include /auth/reset-password",
      };
    }

    return { valid: true as const, url: parsed.toString() };
  } catch {
    return { valid: false as const, reason: "redirectTo is not a valid URL" };
  }
}

export function markPasswordRecoveryPending() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(PASSWORD_RECOVERY_SESSION_KEY, "1");
}

export function clearPasswordRecoveryPending() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(PASSWORD_RECOVERY_SESSION_KEY);
}

export function isPasswordRecoveryPending() {
  if (typeof window === "undefined") {
    return false;
  }

  return sessionStorage.getItem(PASSWORD_RECOVERY_SESSION_KEY) === "1";
}

type UrlParts = {
  pathname: string;
  search: string;
  hash: string;
};

export type RecoveryUrlTokens = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorDescription: string | null;
};

function getHashParams(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function getSearchParams(search: string) {
  return new URLSearchParams(search.replace(/^\?/, ""));
}

/** Read recovery tokens from URL hash and query (Supabase uses both formats). */
export function parseRecoveryTokensFromUrl(location: Pick<UrlParts, "search" | "hash"> = {
  search: typeof window !== "undefined" ? window.location.search : "",
  hash: typeof window !== "undefined" ? window.location.hash : "",
}): RecoveryUrlTokens {
  const query = getSearchParams(location.search);
  const fragment = getHashParams(location.hash);

  return {
    code: query.get("code"),
    tokenHash: query.get("token_hash") ?? fragment.get("token_hash"),
    type: query.get("type") ?? fragment.get("type"),
    accessToken: fragment.get("access_token") ?? query.get("access_token"),
    refreshToken: fragment.get("refresh_token") ?? query.get("refresh_token"),
    errorDescription: fragment.get("error_description") ?? query.get("error_description"),
  };
}

export function isResetPasswordPath(pathname: string) {
  return pathname === "/auth/reset-password" || pathname === "/auth/reset-password/";
}

export function hasPasswordRecoveryTokens(location: Pick<UrlParts, "search" | "hash">) {
  const tokens = parseRecoveryTokensFromUrl(location);

  if (tokens.errorDescription) {
    return true;
  }

  if (tokens.type === "recovery") {
    return true;
  }

  if (tokens.code) {
    return true;
  }

  if (tokens.tokenHash) {
    return true;
  }

  if (tokens.accessToken && tokens.refreshToken) {
    return true;
  }

  return false;
}

/** If recovery tokens landed on the wrong route (e.g. Site URL `/`), forward to reset page. */
export function getPasswordRecoveryForwardUrl(location: UrlParts) {
  if (!hasPasswordRecoveryTokens(location)) {
    return null;
  }

  if (isResetPasswordPath(location.pathname)) {
    return null;
  }

  return `/auth/reset-password${location.search}${location.hash}`;
}

function cleanRecoveryUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

function maskToken(value: string | null) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 8)}…(${value.length} chars)`;
}

async function verifyActiveRecoverySession() {
  const { data, error } = await supabase.auth.getSession();

  recoveryLog("getSession result", {
    error: error?.message ?? null,
    hasSession: Boolean(data.session),
    userId: data.session?.user?.id ?? null,
    email: data.session?.user?.email ?? null,
  });

  if (error) {
    throw error;
  }

  if (!data.session?.user) {
    throw new Error(RESET_LINK_INVALID_MESSAGE);
  }

  markPasswordRecoveryPending();
  return data.session;
}

async function setSessionFromTokens(accessToken: string, refreshToken: string) {
  recoveryLog("calling setSession", {
    accessToken: maskToken(accessToken),
    refreshToken: maskToken(refreshToken),
  });

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  recoveryLog("setSession result", {
    error: error?.message ?? null,
    hasSession: Boolean(data.session),
    userId: data.session?.user?.id ?? null,
  });

  if (error) {
    recoveryLog("setSession failed — clearing stale local session and retrying once");
    await clearLocalAuthSession();

    const retry = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    recoveryLog("setSession retry result", {
      error: retry.error?.message ?? null,
      hasSession: Boolean(retry.data.session),
      userId: retry.data.session?.user?.id ?? null,
    });

    if (retry.error) {
      throw retry.error;
    }

    return retry.data.session;
  }

  return data.session;
}

export async function activatePasswordRecoverySession() {
  recoveryLog("URL received", {
    href: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  });

  const tokens = parseRecoveryTokensFromUrl();
  recoveryLog("tokens found", {
    type: tokens.type,
    code: tokens.code ? maskToken(tokens.code) : null,
    tokenHash: tokens.tokenHash ? maskToken(tokens.tokenHash) : null,
    accessToken: maskToken(tokens.accessToken),
    refreshToken: maskToken(tokens.refreshToken),
    errorDescription: tokens.errorDescription,
  });

  if (tokens.errorDescription) {
    throw new Error(tokens.errorDescription);
  }

  const hasUrlTokens = Boolean(
    tokens.code || tokens.tokenHash || (tokens.accessToken && tokens.refreshToken)
  );

  if (!hasUrlTokens) {
    const existing = await verifyActiveRecoverySession();
    cleanRecoveryUrl();
    return existing;
  }

  if (tokens.accessToken && tokens.refreshToken) {
    await setSessionFromTokens(tokens.accessToken, tokens.refreshToken);
    cleanRecoveryUrl();
    return verifyActiveRecoverySession();
  }

  if (tokens.code) {
    recoveryLog("calling exchangeCodeForSession", { code: maskToken(tokens.code) });

    const { data, error } = await supabase.auth.exchangeCodeForSession(tokens.code);

    recoveryLog("exchangeCodeForSession result", {
      error: error?.message ?? null,
      hasSession: Boolean(data.session),
      userId: data.session?.user?.id ?? null,
    });

    if (error) {
      throw error;
    }

    cleanRecoveryUrl();
    return verifyActiveRecoverySession();
  }

  if (tokens.tokenHash) {
    recoveryLog("calling verifyOtp", {
      tokenHash: maskToken(tokens.tokenHash),
      type: tokens.type ?? "recovery",
    });

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokens.tokenHash,
      type: "recovery",
    });

    recoveryLog("verifyOtp result", {
      error: error?.message ?? null,
      hasSession: Boolean(data.session),
      userId: data.session?.user?.id ?? null,
    });

    if (error) {
      throw error;
    }

    cleanRecoveryUrl();
    return verifyActiveRecoverySession();
  }

  recoveryLog("no matching token handler — checking existing session as last resort");
  return verifyActiveRecoverySession();
}
