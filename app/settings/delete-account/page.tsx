"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import SettingsScreenLayout from "@/components/settings/SettingsScreenLayout";
import {
  SettingsPageHeader,
  settingsDangerButtonClass,
  settingsFieldClass,
} from "@/components/settings/SettingsUI";
import { useI18n } from "@/components/I18nProvider";
import { markIntentionalSignOut } from "@/lib/authMessages";
import { getSafeAuthSession, setAuthNotice } from "@/lib/authSession";
import { deleteCurrentAccount } from "@/lib/deleteAccount";
import { localizeCaughtError } from "@/lib/i18n/localizeUserMessage";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export default function DeleteAccountPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [username, setUsername] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSafeAuthSession().then(async ({ session }) => {
      if (!session?.user) {
        setLoading(false);
        router.replace("/auth/login");
        return;
      }

      const { data } = await supabase.from("profiles").select("username").eq("id", session.user.id).maybeSingle();
      setUsername(publicProfileUsername(data?.username ?? session.user.user_metadata?.username ?? ""));
      setLoading(false);
    });
  }, [router]);

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (deleting) {
      return;
    }

    setDeleting(true);
    setError(null);

    if (confirmText.trim().toLowerCase() !== username.toLowerCase()) {
      setError(t("settings.delete.confirmError", { username }));
      setDeleting(false);
      return;
    }

    try {
      const result = await deleteCurrentAccount();

      if (!result.ok) {
        setError(localizeCaughtError(t, result.error, "settings.delete.failed"));
        setDeleting(false);
        return;
      }

      markIntentionalSignOut();
      await supabase.auth.signOut({ scope: "global" });
      setAuthNotice(t("settings.delete.success"));
      router.replace("/auth/login");
    } catch (caught) {
      setError(localizeCaughtError(t, caught, "settings.delete.failed"));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <SettingsScreenLayout>
          <SettingsPageHeader title={t("settings.delete.title")} />
          <p className="text-sm text-muted">{t("common.loading")}</p>
      </SettingsScreenLayout>
    );
  }

  return (
    <SettingsScreenLayout>
        <SettingsPageHeader title={t("settings.delete.title")} />

        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm leading-relaxed text-red-100">{t("settings.delete.warning")}</p>

          <form onSubmit={(event) => void handleDelete(event)} className="mt-5 space-y-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-red-200/80">
              {t("settings.delete.confirmLabel", { username })}
              <input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className={settingsFieldClass}
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
            ) : null}

            <button type="submit" disabled={deleting} className={settingsDangerButtonClass}>
              {deleting ? t("settings.delete.processing") : t("settings.delete.button")}
            </button>
          </form>
        </div>
    </SettingsScreenLayout>
  );
}
