"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import {
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from "@/components/auth/authStyles";
import { sendPhoneRecoveryOtp, verifyPhoneRecoveryOtp } from "@/lib/authPhone";
import { logAuthSessionError } from "@/lib/authSession";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";

export default function PhoneRecoveryForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState("");
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
      const result = await sendPhoneRecoveryOtp(phone);

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
      const result = await verifyPhoneRecoveryOtp(phone, code);

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (!result.session) {
        setError(t("auth.error.unableVerifyPhone"));
        setLoading(false);
        return;
      }

      router.push("/auth/reset-password");
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
            {localizeUserMessage(t, error) ?? t("auth.error.phoneRecoveryFailed")}
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
        {loading ? t("auth.verifying") : t("auth.continue")}
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
