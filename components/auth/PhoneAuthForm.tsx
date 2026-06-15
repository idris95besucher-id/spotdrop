"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { authInputClass, authPrimaryButtonClass, authSecondaryButtonClass, authLabelClass } from "@/components/auth/authStyles";
import { completeAuthRedirect } from "@/lib/authRedirect";
import { sendPhoneOtp, verifyPhoneOtp } from "@/lib/authPhone";
import { getSafeAuthSession, logAuthSessionError } from "@/lib/authSession";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { ensureProfileRow } from "@/lib/profile";
import { supabase } from "@/lib/supabaseClient";

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;

type PhoneAuthFormProps = {
  mode: "login" | "register";
};

export default function PhoneAuthForm({ mode }: PhoneAuthFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "register") {
        const normalizedUsername = username.trim().toLowerCase();

        if (!USERNAME_REGEX.test(normalizedUsername)) {
          setError(t("auth.error.usernameInvalid"));
          setLoading(false);
          return;
        }

        const { data: existingProfile, error: existingProfileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", normalizedUsername)
          .maybeSingle();

        if (existingProfileError) {
          setError(t("auth.error.usernameValidateFailed"));
          setLoading(false);
          return;
        }

        if (existingProfile) {
          setError(t("auth.error.usernameTaken"));
          setLoading(false);
          return;
        }

        const result = await sendPhoneOtp(phone, {
          username: normalizedUsername,
          isRegister: true,
        });

        if (result.error) {
          setError(result.error);
          setLoading(false);
          return;
        }

        setCodeSent(true);
        setInfo(t("auth.codeSent"));
        setLoading(false);
        return;
      }

      const result = await sendPhoneOtp(phone, { isRegister: false });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setCodeSent(true);
      setInfo(t("auth.codeSent"));
    } catch (caught) {
      logAuthSessionError(caught);
      setError(t("auth.error.unableSendCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await verifyPhoneOtp(phone, code);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (mode === "register") {
        const normalizedUsername = username.trim().toLowerCase();
        const { session } = await getSafeAuthSession();

        if (session?.user) {
          await ensureProfileRow({
            user: session.user,
            username: normalizedUsername,
          });
        }
      }

      const redirectResult = await completeAuthRedirect(router);

      if (redirectResult.error) {
        setError(redirectResult.error);
      }
    } catch (caught) {
      logAuthSessionError(caught);
      setError(t("auth.error.unableVerifyCode"));
    } finally {
      setLoading(false);
    }
  };

  const phoneDisplay = phone.trim() || t("auth.yourPhone");

  if (!codeSent) {
    return (
      <form onSubmit={(event) => void handleSendCode(event)} className="space-y-4">
        {mode === "register" ? (
          <label className={authLabelClass}>
            {t("common.username")}
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={authInputClass}
              placeholder={t("auth.usernamePlaceholder")}
            />
          </label>
        ) : null}

        <label className={authLabelClass}>
          {t("auth.phoneNumber")}
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            className={authInputClass}
            placeholder={t("auth.phonePlaceholder")}
          />
        </label>

        {error ? (
          <p className="text-sm text-red-400">
            {localizeUserMessage(t, error) ?? t("auth.error.phoneContinueFailed")}
          </p>
        ) : null}
        {info ? <p className="text-sm text-emerald-300">{localizeUserMessage(t, info) ?? info}</p> : null}

        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
          {loading ? t("auth.sending") : t("auth.sendSmsCode")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(event) => void handleVerify(event)} className="space-y-4">
      <p className="text-sm text-slate-400">
        {t("auth.enterCodeSentTo", { phone: phoneDisplay })}
      </p>

      <label className={authLabelClass}>
        {t("auth.verificationCode")}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
          className={authInputClass}
          placeholder={t("auth.codePlaceholder")}
        />
      </label>

      {error ? (
        <p className="text-sm text-red-400">
          {localizeUserMessage(t, error) ?? t("auth.error.unableVerifyCode")}
        </p>
      ) : null}

      <button type="submit" disabled={loading || code.length < 4} className={authPrimaryButtonClass}>
        {loading
          ? mode === "register"
            ? t("auth.creatingAccount")
            : t("auth.signingIn")
          : mode === "register"
            ? t("auth.createAccount")
            : t("auth.logIn")}
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setCodeSent(false);
          setCode("");
          setError(null);
          setInfo(null);
        }}
        className={authSecondaryButtonClass}
      >
        {t("auth.changePhone")}
      </button>
    </form>
  );
}
