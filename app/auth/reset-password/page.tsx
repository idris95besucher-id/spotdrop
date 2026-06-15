"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import PasswordField from "@/components/auth/PasswordField";
import { useI18n } from "@/components/I18nProvider";
import { authPrimaryButtonClass, authSecondaryButtonClass } from "@/components/auth/authStyles";
import {
  mapAuthError,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
} from "@/lib/authMessages";
import { clearLocalAuthSession, logAuthSessionError, setAuthNotice } from "@/lib/authSession";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { supabase } from "@/lib/supabaseClient";

type RecoveryState = "checking" | "ready" | "success" | "error";

const CHECKING_RESET_LINK_MESSAGE = "Checking your reset link…";
const RESET_CHOOSE_PASSWORD_BODY = "Choose a new password for your account.";
const UPDATING_PASSWORD_MESSAGE = "Updating password…";
const PASSWORD_UPDATED_REDIRECT_MESSAGE = "Password updated. Redirecting to login…";
const PASSWORD_UPDATED_SIGN_IN_MESSAGE = "Password updated. Sign in with your new password.";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<RecoveryState>("checking");
  const [message, setMessage] = useState(CHECKING_RESET_LINK_MESSAGE);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(
    () => password.length >= 8 && password === confirmPassword,
    [confirmPassword, password]
  );

  const displayMessage = localizeUserMessage(t, message) ?? message;

  useEffect(() => {
    let cancelled = false;

    const activateRecoverySession = async () => {
      setStatus("checking");
      setMessage(CHECKING_RESET_LINK_MESSAGE);

      try {
        const code = new URLSearchParams(window.location.search).get("code");
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const tokenType = hashParams.get("type");
        const errorDescription = hashParams.get("error_description");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (code) {
          await clearLocalAuthSession();

          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }

          if (!cancelled) {
            setStatus("ready");
            setMessage(RESET_CHOOSE_PASSWORD_BODY);
          }

          return;
        }

        if (accessToken && refreshToken && tokenType === "recovery") {
          await clearLocalAuthSession();

          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }

          window.history.replaceState(null, "", window.location.pathname);

          if (!cancelled) {
            setStatus("ready");
            setMessage(RESET_CHOOSE_PASSWORD_BODY);
          }

          return;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!data.session?.user) {
          throw new Error(RESET_LINK_INVALID_MESSAGE);
        }

        if (!cancelled) {
          setStatus("ready");
          setMessage(RESET_CHOOSE_PASSWORD_BODY);
        }
      } catch (recoveryError) {
        logAuthSessionError(recoveryError);

        if (!cancelled) {
          setStatus("error");
          setMessage(mapAuthError(recoveryError, RESET_LINK_INVALID_MESSAGE));
        }
      }
    };

    void activateRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      setMessage(PASSWORD_TOO_SHORT_MESSAGE);
      return;
    }

    if (password !== confirmPassword) {
      setMessage(PASSWORD_MISMATCH_MESSAGE);
      return;
    }

    setSaving(true);
    setMessage(UPDATING_PASSWORD_MESSAGE);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      await clearLocalAuthSession();
      setAuthNotice(PASSWORD_UPDATED_SIGN_IN_MESSAGE);
      setStatus("success");
      setMessage(PASSWORD_UPDATED_REDIRECT_MESSAGE);

      window.setTimeout(() => {
        router.push("/auth/login");
      }, 1200);
    } catch (updateError) {
      logAuthSessionError(updateError);
      setStatus("ready");
      setMessage(mapAuthError(updateError, "Unable to update your password. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      title={t("auth.resetChoosePassword")}
      footer={
        status === "error" || status === "success" ? (
          <Link href="/auth/login" className="font-semibold text-white hover:underline">
            {t("auth.backToLogin")}
          </Link>
        ) : null
      }
    >
      <p
        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          status === "error"
            ? "border-red-500/20 bg-red-500/10 text-red-200"
            : status === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              : "border-white/10 bg-white/5 text-slate-300"
        }`}
      >
        {displayMessage}
      </p>

      {status === "ready" ? (
        <form onSubmit={(event) => void handleUpdatePassword(event)} className="space-y-4">
          <PasswordField
            id="reset-password"
            label={t("auth.newPassword")}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={t("auth.passwordHint")}
          />
          <PasswordField
            id="reset-confirm-password"
            label={t("auth.confirmNewPassword")}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          <button type="submit" disabled={saving || !canSubmit} className={authPrimaryButtonClass}>
            {saving ? t("auth.updatingPassword") : t("auth.updatePassword")}
          </button>
        </form>
      ) : null}

      {status === "error" || status === "success" ? (
        <Link href="/auth/login" className={`${authSecondaryButtonClass} block text-center no-underline`}>
          {t("auth.backToLogin")}
        </Link>
      ) : null}
    </AuthShell>
  );
}
