"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import PasswordField from "@/components/auth/PasswordField";
import SettingsScreenLayout from "@/components/settings/SettingsScreenLayout";
import { SettingsPageHeader, settingsPrimaryButtonClass } from "@/components/settings/SettingsUI";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { mapAuthErrorI18n } from "@/lib/i18n/mapAuthErrorI18n";
import { supabase } from "@/lib/supabaseClient";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => password.length >= 8 && password === confirmPassword,
    [confirmPassword, password]
  );

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      if (!session?.user) {
        router.replace("/auth/login");
        return;
      }

      setLoading(false);
    });
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError(t("auth.error.passwordTooShort"));
      setSaving(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.error.passwordMismatch"));
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(mapAuthErrorI18n(t, updateError, "auth.error.unableUpdatePassword"));
      setSaving(false);
      return;
    }

    setMessage(t("settings.changePassword.updated"));
    setPassword("");
    setConfirmPassword("");
    setSaving(false);
  };

  if (loading) {
    return (
      <SettingsScreenLayout>
          <SettingsPageHeader title={t("settings.changePassword.title")} />
          <p className="text-sm text-muted">{t("common.loading")}</p>
      </SettingsScreenLayout>
    );
  }

  return (
    <SettingsScreenLayout>
        <SettingsPageHeader title={t("settings.changePassword.title")} />

        <div className="rounded-2xl border border-white/[0.08] bg-[#0B1026] p-5">
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <PasswordField
              id="settings-new-password"
              label={t("auth.newPassword")}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              hint={t("auth.passwordHint")}
            />
            <PasswordField
              id="settings-confirm-password"
              label={t("auth.confirmNewPassword")}
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />

            {error ? (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
            ) : null}
            {message ? (
              <p className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </p>
            ) : null}

            <button type="submit" disabled={saving || !canSubmit} className={settingsPrimaryButtonClass}>
              {saving ? t("auth.updatingPassword") : t("auth.updatePassword")}
            </button>
          </form>
        </div>
    </SettingsScreenLayout>
  );
}
