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
import { mapAuthErrorI18n } from "@/lib/i18n/mapAuthErrorI18n";
import { supabase } from "@/lib/supabaseClient";

export default function ChangeEmailPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const trimmed = newEmail.trim();

    if (!trimmed || !trimmed.includes("@")) {
      setError(t("auth.error.invalidEmail"));
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ email: trimmed });

    if (updateError) {
      setError(mapAuthErrorI18n(t, updateError, "settings.changeEmail.failed"));
      setSaving(false);
      return;
    }

    setMessage(t("settings.changeEmail.checkInbox"));
    setNewEmail("");
    setSaving(false);
  };

  if (loading) {
    return (
      <SettingsScreenLayout>
          <SettingsPageHeader title={t("settings.changeEmail.title")} />
          <p className="text-sm text-muted">{t("common.loading")}</p>
      </SettingsScreenLayout>
    );
  }

  return (
    <SettingsScreenLayout>
        <SettingsPageHeader title={t("settings.changeEmail.title")} />

        <div className="rounded-2xl border border-white/[0.08] bg-[#0B1026] p-5">
          <p className="text-sm leading-relaxed text-muted">
            {t("settings.changeEmail.body")} {t("settings.emailPrivate")}
          </p>

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-muted">
              {t("settings.changeEmail.newEmail")}
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                className={settingsFieldClass}
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
            ) : null}
            {message ? (
              <p className="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </p>
            ) : null}

            <button type="submit" disabled={saving} className={settingsPrimaryButtonClass}>
              {saving ? t("settings.changeEmail.sending") : t("settings.changeEmail.update")}
            </button>
          </form>
        </div>
    </SettingsScreenLayout>
  );
}
