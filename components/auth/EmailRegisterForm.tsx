"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import PasswordField from "@/components/auth/PasswordField";
import { useI18n } from "@/components/I18nProvider";
import { authInputClass, authPrimaryButtonClass, authLabelClass } from "@/components/auth/authStyles";
import {
  mapAuthError,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
} from "@/lib/authMessages";
import { logAuthSessionError } from "@/lib/authSession";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { ensureProfileRow } from "@/lib/profile";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;

export default function EmailRegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (supabaseConfigError) {
        setError(t("auth.error.signupDisabled"));
        return;
      }

      const trimmedEmail = email.trim();
      const normalizedUsername = username.trim().toLowerCase();

      if (!trimmedEmail) {
        setError(t("auth.error.emailRequired"));
        return;
      }

      if (!USERNAME_REGEX.test(normalizedUsername)) {
        setError(t("auth.error.usernameInvalid"));
        return;
      }

      if (password.length < 8) {
        setError(PASSWORD_TOO_SHORT_MESSAGE);
        return;
      }

      if (password !== confirmPassword) {
        setError(PASSWORD_MISMATCH_MESSAGE);
        return;
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle();

      if (existingProfileError) {
        setError(t("auth.error.usernameValidateFailed"));
        return;
      }

      if (existingProfile) {
        setError(t("auth.error.usernameTaken"));
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { username: normalizedUsername },
        },
      });

      if (signUpError) {
        logAuthSessionError(signUpError);
        setError(mapAuthError(signUpError, "Unable to create your account. Please try again."));
        return;
      }

      const authUser = data.user ?? data.session?.user;

      if (!authUser?.id) {
        setError(t("auth.error.checkEmailConfirm"));
        return;
      }

      if (!data.session) {
        setError(t("auth.error.accountCreatedConfirm"));
        return;
      }

      const ensureProfileResult = await ensureProfileRow({
        user: authUser,
        username: normalizedUsername,
      });

      if (ensureProfileResult.error) {
        setError(ensureProfileResult.error);
        return;
      }

      router.push("/profile");
    } catch (caught) {
      logAuthSessionError(caught);
      setError(mapAuthError(caught, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <label htmlFor="register-email" className={authLabelClass}>
        {t("common.email")}
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          className={authInputClass}
        />
      </label>

      <label htmlFor="register-username" className={authLabelClass}>
        {t("common.username")}
        <input
          id="register-username"
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("auth.usernamePlaceholder")}
          className={authInputClass}
        />
      </label>

      <PasswordField
        id="register-password"
        label={t("common.password")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={t("auth.passwordHint")}
      />

      <PasswordField
        id="register-confirm-password"
        label={t("auth.confirmPassword")}
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
      />

      {error ? (
        <p className="text-sm text-red-400">
          {localizeUserMessage(t, error) ?? t("auth.error.registrationFailed")}
        </p>
      ) : null}

      <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
        {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
      </button>
    </form>
  );
}
