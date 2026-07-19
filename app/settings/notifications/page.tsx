"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SettingsScreenLayout from "@/components/settings/SettingsScreenLayout";
import {
  SettingsPageHeader,
  SettingsSection,
  SettingsToggleRow,
} from "@/components/settings/SettingsUI";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadUserSettingsPreferences,
  updateUserSettingsPreferences,
  type NotificationPreferences,
} from "@/lib/settingsPreferences";
import { syncUserNotificationPreferences } from "@/lib/userNotificationPreferences";

type AlertPreferenceKey = Exclude<keyof NotificationPreferences, "sound" | "vibration" | "newFollowers">;

export default function NotificationsSettingsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);

  useEffect(() => {
    let active = true;

    void getSafeAuthSession().then(({ session }) => {
      if (!active) {
        return;
      }

      if (!session?.user) {
        router.replace("/auth/login");
        return;
      }

      setUserId(session.user.id);
      const nextPrefs = loadUserSettingsPreferences().notifications;
      setPrefs(nextPrefs);
      void syncUserNotificationPreferences(session.user.id, nextPrefs);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [router]);

  const persist = (patch: Partial<NotificationPreferences>) => {
    const next = updateUserSettingsPreferences({ notifications: patch }).notifications;
    setPrefs(next);

    if (userId) {
      void syncUserNotificationPreferences(userId, next);
    }
  };

  const handleAllChange = (checked: boolean) => {
    persist({
      all: checked,
      messages: checked,
      groupMessages: checked,
      roomMessages: checked,
      likes: checked,
      comments: checked,
      newFollowers: checked,
    });
  };

  const handleAlertChange = (key: AlertPreferenceKey, checked: boolean) => {
    if (key === "all") {
      handleAllChange(checked);
      return;
    }

    const nextAlerts = {
      messages: key === "messages" ? checked : prefs.messages,
      groupMessages: key === "groupMessages" ? checked : prefs.groupMessages,
      roomMessages: key === "roomMessages" ? checked : prefs.roomMessages,
      likes: key === "likes" ? checked : prefs.likes,
      comments: key === "comments" ? checked : prefs.comments,
    };

    const anyOn =
      nextAlerts.messages ||
      nextAlerts.groupMessages ||
      nextAlerts.roomMessages ||
      nextAlerts.likes ||
      nextAlerts.comments;

    persist({
      ...nextAlerts,
      all: anyOn,
    });
  };

  if (loading) {
    return (
      <SettingsScreenLayout>
        <SettingsPageHeader title={t("settings.notificationsSounds")} backHref="/settings" />
        <p className="px-1 text-sm text-muted">{t("settings.loading")}</p>
      </SettingsScreenLayout>
    );
  }

  const alertsDisabled = !prefs.all;

  return (
    <SettingsScreenLayout>
      <SettingsPageHeader title={t("settings.notificationsSounds")} backHref="/settings" />

      <SettingsSection title={t("settings.notifications")}>
        <SettingsToggleRow
          label={t("settings.notifyAll")}
          checked={prefs.all}
          onChange={(checked) => handleAlertChange("all", checked)}
        />
        <SettingsToggleRow
          label={t("settings.notifyDirectMessages")}
          checked={prefs.all && prefs.messages}
          disabled={alertsDisabled}
          onChange={(checked) => handleAlertChange("messages", checked)}
        />
        <SettingsToggleRow
          label={t("settings.notifyGroupMessages")}
          checked={prefs.all && prefs.groupMessages}
          disabled={alertsDisabled}
          onChange={(checked) => handleAlertChange("groupMessages", checked)}
        />
        <SettingsToggleRow
          label={t("settings.notifyRoomMessages")}
          checked={prefs.all && prefs.roomMessages}
          disabled={alertsDisabled}
          onChange={(checked) => handleAlertChange("roomMessages", checked)}
        />
        <SettingsToggleRow
          label={t("settings.notifyLikes")}
          checked={prefs.all && prefs.likes}
          disabled={alertsDisabled}
          onChange={(checked) => handleAlertChange("likes", checked)}
        />
        <SettingsToggleRow
          label={t("settings.notifyComments")}
          checked={prefs.all && prefs.comments}
          disabled={alertsDisabled}
          onChange={(checked) => handleAlertChange("comments", checked)}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.sounds")}>
        <SettingsToggleRow
          label={t("settings.notifySound")}
          checked={prefs.sound}
          onChange={(checked) => persist({ sound: checked })}
        />
        <SettingsToggleRow
          label={t("settings.notifyVibration")}
          checked={prefs.vibration}
          onChange={(checked) => persist({ vibration: checked })}
        />
      </SettingsSection>

      <p className="px-1 text-xs leading-relaxed text-muted">{t("settings.notificationsLocalHint")}</p>
    </SettingsScreenLayout>
  );
}
