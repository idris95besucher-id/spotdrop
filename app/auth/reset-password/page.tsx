"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import PasswordField from "@/components/auth/PasswordField";
import { useI18n } from "@/components/I18nProvider";
import { authPrimaryButtonClass, authSecondaryButtonClass } from "@/components/auth/authStyles";
import { activatePasswordRecoverySession, clearPasswordRecoveryPending } from "@/lib/authPasswordReset";
import {
  mapAuthError,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  PASSWORD_UPDATED_SUCCESS_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
} from "@/lib/authMessages";
import { clearLocalAuthSession, logAuthSessionError, setAuthNotice } from "@/lib/authSession";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { TranslationKey } from "@/lib/i18n/messages";
import { supabase } from "@/lib/supabaseClient";

type RecoveryState = "checking" | "ready" | "success" | "error";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<RecoveryState>("checking");
  const [message, setMessage] = useState("auth.checkingResetLink");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const canSubmit = useMemo(
    () => password.length >= 8 && password === confirmPassword,
    [confirmPassword, password]
  );

  const displayMessage = message.startsWith("auth.")
    ? t(message as TranslationKey)
    : (localizeUserMessage(t, message) ?? message);

  useEffect(() => {
    let cancelled = false;

    const startRecovery = async () => {
      setStatus("checking");
      setMessage("auth.checkingResetLink");

      try {
        const session = await activatePasswordRecoverySession();

        if (!cancelled) {
          setStatus("ready");
        }
      } catch (recoveryError) {
        logAuthSessionError(recoveryError);
        console.error("[SpotDrop recovery] activation failed", recoveryError);

        if (!cancelled) {
          setStatus("error");
          setMessage(mapAuthError(recoveryError, RESET_LINK_INVALID_MESSAGE));
        }
      }
    };

    void startRecovery();

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
    setMessage("auth.updatingPassword");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      await clearLocalAuthSession();
      clearPasswordRecoveryPending();
      setAuthNotice(PASSWORD_UPDATED_SUCCESS_MESSAGE);
      setStatus("success");
      setMessage("auth.passwordUpdatedSuccess");

      window.setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
    } catch (updateError) {
      logAuthSessionError(updateError);
      setStatus("ready");
      setMessage(mapAuthError(updateError, t("auth.error.unableUpdatePassword")));
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
      {status === "checking" ? (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          {t("auth.checkingResetLink")}
        </p>
      ) : null}

      {status === "error" || status === "success" ? (
        <div className="space-y-4">
          <p
            className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              status === "error"
                ? "border-red-500/20 bg-red-500/10 text-red-200"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {displayMessage}
          </p>
          <Link href="/auth/login" className={`${authSecondaryButtonClass} block text-center no-underline`}>
            {t("auth.backToLogin")}
          </Link>
        </div>
      ) : null}

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
          {passwordTooShort ? (
            <p className="text-sm text-red-400">{t("auth.error.passwordTooShort")}</p>
          ) : null}

          <PasswordField
            id="reset-confirm-password"
            label={t("auth.confirmNewPassword")}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          {passwordsMismatch ? (
            <p className="text-sm text-red-400">{t("auth.error.passwordMismatch")}</p>
          ) : null}

          {message !== "auth.updatingPassword" &&
          message !== "auth.checkingResetLink" &&
          !message.startsWith("auth.") ? (
            <p className="text-sm text-red-400">{displayMessage}</p>
          ) : null}

          {message === "auth.updatingPassword" ? (
            <p className="text-sm text-muted">{t("auth.updatingPassword")}</p>
          ) : null}

          <button type="submit" disabled={saving || !canSubmit} className={authPrimaryButtonClass}>
            {saving ? t("auth.updatingPassword") : t("auth.updatePassword")}
          </button>
        </form>
      ) : null}
    </AuthShell>
  );
}
