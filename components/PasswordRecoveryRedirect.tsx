"use client";

import { useEffect } from "react";
import {
  getPasswordRecoveryForwardUrl,
  hasPasswordRecoveryTokens,
  isPasswordRecoveryPending,
  isResetPasswordPath,
  markPasswordRecoveryPending,
} from "@/lib/authPasswordReset";
import { supabase } from "@/lib/supabaseClient";

function redirectToResetPassword() {
  const target = `/auth/reset-password${window.location.search}${window.location.hash}`;

  if (window.location.pathname + window.location.search + window.location.hash === target) {
    return;
  }

  window.location.replace(target);
}

/** Keeps recovery links on /auth/reset-password even when Supabase lands on `/`. */
export default function PasswordRecoveryRedirect() {
  useEffect(() => {
    const pathname = window.location.pathname;

    if (!isResetPasswordPath(pathname)) {
      const forwardUrl = getPasswordRecoveryForwardUrl({
        pathname,
        search: window.location.search,
        hash: window.location.hash,
      });

      if (forwardUrl) {
        window.location.replace(forwardUrl);
        return;
      }

      if (
        isPasswordRecoveryPending() &&
        (pathname === "/" ||
          pathname === "" ||
          hasPasswordRecoveryTokens({
            search: window.location.search,
            hash: window.location.hash,
          }))
      ) {
        redirectToResetPassword();
        return;
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") {
        return;
      }

      markPasswordRecoveryPending();

      if (!isResetPasswordPath(window.location.pathname)) {
        redirectToResetPassword();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
