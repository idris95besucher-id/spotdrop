"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PasswordField from "@/components/auth/PasswordField";
import { useI18n } from "@/components/I18nProvider";
import { authInputClass, authPrimaryButtonClass, authLabelClass } from "@/components/auth/authStyles";
import { signInWithIdentifier } from "@/lib/authLogin";
import { completeAuthRedirect } from "@/lib/authRedirect";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";

export default function EmailLoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!identifier.trim() || !password) {
        setError(t("auth.error.enterCredentials"));
        return;
      }

      const result = await signInWithIdentifier(identifier, password);

      if (result.error) {
        setError(result.error);
        return;
      }

      const redirectResult = await completeAuthRedirect(router);

      if (redirectResult.error) {
        setError(redirectResult.error);
      }
    } catch (caught) {
      setError(
        localizeUserMessage(t, caught instanceof Error ? caught.message : null) ??
          t("auth.error.unableSignIn")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <label htmlFor="login-identifier" className={authLabelClass}>
        {t("auth.emailOrUsername")}
        <input
          id="login-identifier"
          type="text"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={authInputClass}
        />
      </label>

      <div>
        <PasswordField
          id="login-password"
          label={t("common.password")}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <div className="mt-2 text-right">
          <Link href="/auth/forgot-password" className="text-sm font-medium text-slate-300 hover:text-white">
            {t("auth.forgotPassword")}
          </Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400">{localizeUserMessage(t, error) ?? t("auth.error.unableSignIn")}</p>
      ) : null}

      <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
        {loading ? t("auth.signingIn") : t("auth.logIn")}
      </button>
    </form>
  );
}
