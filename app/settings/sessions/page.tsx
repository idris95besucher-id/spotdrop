"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import SettingsScreenLayout from "@/components/settings/SettingsScreenLayout";
import { SettingsPageHeader } from "@/components/settings/SettingsUI";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";

export default function ActiveSessionsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [deviceKind, setDeviceKind] = useState<"mobile" | "desktop">("desktop");
  const [platform, setPlatform] = useState("");

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      if (!session?.user) {
        router.replace("/auth/login");
        return;
      }

      setLastSignIn(session.user.last_sign_in_at ?? null);

      if (typeof navigator !== "undefined") {
        setPlatform(navigator.platform || "");
        setDeviceKind(/iPhone|iPad|Android/i.test(navigator.userAgent) ? "mobile" : "desktop");
      }

      setLoading(false);
    });
  }, [router]);

  const deviceLabel = useMemo(() => {
    const kindLabel =
      deviceKind === "mobile" ? t("settings.sessions.mobile") : t("settings.sessions.desktop");
    const platformLabel = platform || t("settings.sessions.unknownPlatform");
    return `${kindLabel} · ${platformLabel}`;
  }, [deviceKind, platform, t]);

  const formatSessionTime = (value: string | undefined) => {
    if (!value) {
      return t("settings.sessions.unknown");
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return t("settings.sessions.unknown");
    }

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <SettingsScreenLayout>
        <SettingsPageHeader title={t("settings.sessions.title")} />

        <div className="rounded-2xl border border-white/[0.08] bg-[#0B1026] p-5">
          {loading ? (
            <p className="text-sm text-muted">{t("settings.sessions.loading")}</p>
          ) : (
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{t("settings.sessions.current")}</p>
                <p className="mt-1 text-xs text-muted">{deviceLabel}</p>
                <p className="mt-2 text-xs text-muted">
                  {t("settings.sessions.lastSignIn")} {formatSessionTime(lastSignIn ?? undefined)}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-muted">{t("settings.sessions.body")}</p>
              </div>
              <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {t("settings.sessions.active")}
              </span>
            </div>
          )}
        </div>
    </SettingsScreenLayout>
  );
}
