"use client";

import { useEffect } from "react";
import { getPasswordRecoveryForwardUrl } from "@/lib/authPasswordReset";

/** Sends misrouted Supabase recovery links (e.g. Site URL `/`) to `/` reset password page. */
export default function PasswordRecoveryRedirect() {
  useEffect(() => {
    const forwardUrl = getPasswordRecoveryForwardUrl({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });

    if (forwardUrl) {
      window.location.replace(forwardUrl);
    }
  }, []);

  return null;
}
