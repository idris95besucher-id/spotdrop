import {
  RESET_LINK_INVALID_MESSAGE,
} from "@/lib/authMessages";
import { clearLocalAuthSession } from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";

/** Must match Supabase Auth → URL Configuration → Redirect URLs allow list. */
export const PASSWORD_RESET_REDIRECT_URL =
  process.env.NEXT_PUBLIC_PASSWORD_RESET_REDIRECT_URL ??
  "https://spotdrop-five.vercel.app/auth/reset-password";

export function getPasswordResetRedirectUrl() {
  return PASSWORD_RESET_REDIRECT_URL;
}

type UrlParts = {
  pathname: string;
  search: string;
  hash: string;
};

function getHashParams(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

function getSearchParams(search: string) {
  return new URLSearchParams(search.replace(/^\?/, ""));
}

export function hasPasswordRecoveryTokens({ search, hash }: Pick<UrlParts, "search" | "hash">) {
  const query = getSearchParams(search);
  const fragment = getHashParams(hash);
  const type = query.get("type") ?? fragment.get("type");

  if (type === "recovery") {
    return true;
  }

  if (query.get("code")) {
    return true;
  }

  if (query.get("token_hash") && query.get("type") === "recovery") {
    return true;
  }

  if (fragment.get("access_token") && fragment.get("refresh_token") && fragment.get("type") === "recovery") {
    return true;
  }

  return false;
}

/** If recovery tokens landed on the wrong route (e.g. Site URL `/`), forward to reset page. */
export function getPasswordRecoveryForwardUrl(location: UrlParts) {
  if (!hasPasswordRecoveryTokens(location)) {
    return null;
  }

  const resetPath = "/auth/reset-password";

  if (location.pathname === resetPath || location.pathname === `${resetPath}/`) {
    return null;
  }

  return `${resetPath}${location.search}${location.hash}`;
}

export async function activatePasswordRecoverySession() {
  const search = getSearchParams(window.location.search);
  const hash = getHashParams(window.location.hash);
  const errorDescription = hash.get("error_description") ?? search.get("error_description");

  if (errorDescription) {
    throw new Error(errorDescription);
  }

  const code = search.get("code");

  if (code) {
    await clearLocalAuthSession();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }

    window.history.replaceState(null, "", window.location.pathname);
    return;
  }

  const tokenHash = search.get("token_hash");
  const queryType = search.get("type");
  const hashType = hash.get("type");

  if (tokenHash && queryType === "recovery") {
    await clearLocalAuthSession();

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (error) {
      throw error;
    }

    window.history.replaceState(null, "", window.location.pathname);
    return;
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");

  if (accessToken && refreshToken && hashType === "recovery") {
    await clearLocalAuthSession();

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    window.history.replaceState(null, "", window.location.pathname);
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!data.session?.user) {
    throw new Error(RESET_LINK_INVALID_MESSAGE);
  }
}
