"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import SettingsScreenLayout from "@/components/settings/SettingsScreenLayout";
import {
  SettingsPageHeader,
  settingsFieldClass,
  settingsPrimaryButtonClass,
} from "@/components/settings/SettingsUI";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { mapPhoneAuthError, normalizePhoneE164, sendPhoneOtp, verifyPhoneOtp } from "@/lib/authPhone";
import { mapAuthErrorI18n } from "@/lib/i18n/mapAuthErrorI18n";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { supabase } from "@/lib/supabaseClient";

export default function ChangePhonePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      if (!session?.user) {
        router.replace("/auth/login");
        return;
      }

      setLoading(false);
    });
  }, [router]);

  const localizePhoneError = (phoneError: unknown, fallbackKey: Parameters<typeof mapAuthErrorI18n>[2] = "auth.error.phoneContinueFailed") => {
    const english = mapPhoneAuthError(phoneError, "Unable to continue with phone. Please try again.");
    return localizeUserMessage(t, english) ?? mapAuthErrorI18n(t, phoneError, fallbackKey);
  };

  const handleSendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const e164 = normalizePhoneE164(phone);

    if (!e164) {
      setError(t("auth.error.invalidPhone"));
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ phone: e164 });

    if (updateError) {
      const result = await sendPhoneOtp(phone);

      if (result.error) {
        setError(localizePhoneError(updateError));
        setSaving(false);
        return;
      }

      setCodeSent(true);
      setMessage(t("settings.changePhone.codeSent"));
      setSaving(false);
      return;
    }

    setCodeSent(true);
    setMessage(t("settings.changePhone.codeSent"));
    setSaving(false);
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const e164 = normalizePhoneE164(phone);

    if (!e164) {
      setError(t("auth.error.invalidPhoneShort"));
      setSaving(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: e164,
      token: code.trim(),
      type: "phone_change",
    });

    if (verifyError) {
      const fallback = await verifyPhoneOtp(phone, code);

      if (fallback.error) {
        setError(localizePhoneError(verifyError, "auth.error.unableVerifyPhone"));
        setSaving(false);
        return;
      }
    }

    setMessage(t("settings.changePhone.updated"));
    setCodeSent(false);
    setCode("");
    setPhone("");
    setSaving(false);
  };

  if (loading) {
    return (
      <SettingsScreenLayout>
          <SettingsPageHeader title={t("settings.changePhone.title")} />
          <p className="text-sm text-muted">{t("common.loading")}</p>
      </SettingsScreenLayout>
    );
  }

  return (
    <SettingsScreenLayout>
        <SettingsPageHeader title={t("settings.changePhone.title")} />

        <div className="rounded-2xl border border-white/[0.08] bg-[#0B1026] p-5">
          <p className="text-sm leading-relaxed text-muted">{t("settings.changePhone.body")}</p>

          {!codeSent ? (
            <form onSubmit={(event) => void handleSendCode(event)} className="mt-5 space-y-4">
              <label className="block text-xs font-medium uppercase tracking-wide text-muted">
                {t("settings.changePhone.newPhone")}
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder={t("auth.phonePlaceholder")}
                  className={settingsFieldClass}
                />
              </label>

              {error ? (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
              ) : null}

              <button type="submit" disabled={saving} className={settingsPrimaryButtonClass}>
                {saving ? t("settings.changePhone.sendingCode") : t("settings.changePhone.sendCode")}
              </button>
            </form>
          ) : (
            <form onSubmit={(event) => void handleVerify(event)} className="mt-5 space-y-4">
              {message ? (
                <p className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-emerald-200">
                  {message}
                </p>
              ) : null}

              <label className="block text-xs font-medium uppercase tracking-wide text-muted">
                {t("auth.verificationCode")}
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="one-time-code"
                  placeholder={t("auth.codePlaceholder")}
                  className={settingsFieldClass}
                />
              </label>

              {error ? (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
              ) : null}

              <button type="submit" disabled={saving} className={settingsPrimaryButtonClass}>
                {saving ? t("auth.verifying") : t("settings.changePhone.verifyUpdate")}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                  setMessage(null);
                  setError(null);
                }}
                className="w-full text-sm text-muted transition hover:text-white"
              >
                {t("settings.changePhone.useDifferent")}
              </button>
            </form>
          )}
        </div>
    </SettingsScreenLayout>
  );
}
