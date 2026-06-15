"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "@/components/I18nProvider";
import { authInputClass, authLabelClass, authPrimaryButtonClass } from "@/components/auth/authStyles";
import {
  AUTH_CONNECTION_ERROR_MESSAGE,
  mapAuthError,
  RESET_EMAIL_SENT_MESSAGE,
} from "@/lib/authMessages";
import { logAuthSessionError } from "@/lib/authSession";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { supabase } from "@/lib/supabaseClient";

export default function EmailRecoveryForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSent(false);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError(t("auth.error.enterAccountEmail"));
      setLoading(false);
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (resetError) {
        logAuthSessionError(resetError);
        setError(mapAuthError(resetError, AUTH_CONNECTION_ERROR_MESSAGE));
        setLoading(false);
        return;
      }

      setSent(true);
    } catch (caught) {
      logAuthSessionError(caught);
      setError(AUTH_CONNECTION_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <label htmlFor="forgot-email" className={authLabelClass}>
        {t("common.email")}
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          className={authInputClass}
        />
      </label>

      {error ? (
        <p className="text-sm text-red-400">{localizeUserMessage(t, error) ?? t("error.connection")}</p>
      ) : null}

      {sent ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {localizeUserMessage(t, RESET_EMAIL_SENT_MESSAGE) ?? t("auth.error.resetEmailSent")}
        </p>
      ) : null}

      <button type="submit" disabled={loading || sent} className={authPrimaryButtonClass}>
        {loading ? t("auth.sending") : t("auth.sendResetEmail")}
      </button>
    </form>
  );
}
