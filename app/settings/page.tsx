"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  CircleHelp,
  Eye,
  KeyRound,
  Mail,
  Smartphone,
  Trash2,
  UserPen,
  Users,
} from "lucide-react";
import SettingsScreenLayout from "@/components/settings/SettingsScreenLayout";
import SignOutButton from "@/components/SignOutButton";
import { useNotifications } from "@/components/NotificationsProvider";
import { useI18n } from "@/components/I18nProvider";
import { saveProfileLanguage } from "@/lib/i18n/profileLanguage";
import { resolveI18nLocale } from "@/lib/i18n/locales";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { TranslationKey } from "@/lib/i18n/messages";
import {
  SettingsPageHeader,
  SettingsRow,
  SettingsSection,
  SettingsSelectRow,
  SettingsToggleRow,
  SettingsInfoRow,
  SettingsThemePicker,
  settingsPrimaryButtonClass,
  settingsSuccessMessageClass,
} from "@/components/settings/SettingsUI";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  loadUserSettingsPreferences,
  MESSAGE_PRIVACY_VALUES,
  type MessagePrivacy,
  updateUserSettingsPreferences,
} from "@/lib/settingsPreferences";
import {
  normalizeMessagePrivacy,
  saveProfileMessagePrivacy,
} from "@/lib/messagePrivacy";
import {
  normalizeOnlineVisibility,
  ONLINE_VISIBILITY_VALUES,
  saveProfileOnlineVisibility,
  type OnlineVisibility,
} from "@/lib/onlineVisibility";
import { APP_LANGUAGES, applyDocumentLanguage, type AppLanguageCode } from "@/lib/languages";
import {
  ACCENT_COLOR_OPTIONS,
  applyThemeAccent,
  DEFAULT_ACCENT_COLOR,
  isAccentColorCode,
  type AccentColorCode,
} from "@/lib/themeAccent";
import { supabase } from "@/lib/supabaseClient";

const MESSAGE_PRIVACY_LABEL_KEYS: Record<MessagePrivacy, TranslationKey> = {
  everyone: "settings.messagePrivacy.everyone",
  followers: "settings.messagePrivacy.followers",
  friends: "settings.messagePrivacy.friends",
  nobody: "settings.messagePrivacy.nobody",
};

const ONLINE_VISIBILITY_LABEL_KEYS: Record<OnlineVisibility, TranslationKey> = {
  everyone: "settings.onlineVisibility.everyone",
  friends: "settings.onlineVisibility.friends",
  nobody: "settings.onlineVisibility.nobody",
};

const THEME_LABEL_KEYS: Record<AccentColorCode, TranslationKey> = {
  cyan: "settings.theme.cyan",
  green: "settings.theme.green",
  purple: "settings.theme.purple",
  blue: "settings.theme.blue",
};

export default function SettingsPage() {
  const router = useRouter();
  const { t, setLocale } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [messagePrivacy, setMessagePrivacy] = useState<MessagePrivacy>("everyone");
  const [onlineVisibility, setOnlineVisibility] = useState<OnlineVisibility>("everyone");
  const [notifyLikes, setNotifyLikes] = useState(true);
  const [notifyComments, setNotifyComments] = useState(true);
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const { requestPushPermission, pushSupported } = useNotifications();
  const [language, setLanguage] = useState<AppLanguageCode>("en");
  const [draftLanguage, setDraftLanguage] = useState<AppLanguageCode>("en");
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageSaved, setLanguageSaved] = useState(false);
  const [accentColor, setAccentColor] = useState<AccentColorCode>(DEFAULT_ACCENT_COLOR);
  const [draftAccentColor, setDraftAccentColor] = useState<AccentColorCode>(DEFAULT_ACCENT_COLOR);
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);

  const messagePrivacyOptions = useMemo(
    () =>
      MESSAGE_PRIVACY_VALUES.map((value) => ({
        value,
        label: t(MESSAGE_PRIVACY_LABEL_KEYS[value]),
      })),
    [t]
  );

  const onlineVisibilityOptions = useMemo(
    () =>
      ONLINE_VISIBILITY_VALUES.map((value) => ({
        value,
        label: t(ONLINE_VISIBILITY_LABEL_KEYS[value]),
      })),
    [t]
  );

  const themeOptions = useMemo(
    () =>
      ACCENT_COLOR_OPTIONS.map((option) => ({
        value: option.code,
        label: t(THEME_LABEL_KEYS[option.code]),
        color: option.primary,
      })),
    [t]
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { session: nextSession } = await getSafeAuthSession();

      if (!active) {
        return;
      }

      if (!nextSession?.user) {
        router.replace("/auth/login");
        return;
      }

      setSession(nextSession);

      const prefs = loadUserSettingsPreferences();
      const metadataLocale = nextSession.user.user_metadata?.locale;
      const resolvedLanguage =
        prefs.language !== "en" || !metadataLocale
          ? prefs.language
          : typeof metadataLocale === "string" && APP_LANGUAGES.some((option) => option.code === metadataLocale)
            ? metadataLocale
            : prefs.language;

      const metadataAccent = nextSession.user.user_metadata?.accent_color;
      const resolvedAccent =
        prefs.accentColor !== DEFAULT_ACCENT_COLOR || !metadataAccent
          ? prefs.accentColor
          : typeof metadataAccent === "string" && isAccentColorCode(metadataAccent)
            ? metadataAccent
            : prefs.accentColor;

      setLanguage(resolvedLanguage as AppLanguageCode);
      setDraftLanguage(resolvedLanguage as AppLanguageCode);
      applyDocumentLanguage(resolvedLanguage as AppLanguageCode);

      if (resolvedLanguage !== prefs.language) {
        updateUserSettingsPreferences({ language: resolvedLanguage as AppLanguageCode });
      }

      setAccentColor(resolvedAccent as AccentColorCode);
      setDraftAccentColor(resolvedAccent as AccentColorCode);
      applyThemeAccent(resolvedAccent);

      if (resolvedAccent !== prefs.accentColor) {
        updateUserSettingsPreferences({ accentColor: resolvedAccent as AccentColorCode });
      }

      setMessagePrivacy(prefs.messagePrivacy);
      setNotifyLikes(prefs.notifications.likes);
      setNotifyComments(prefs.notifications.comments);
      setNotifyFollowers(prefs.notifications.newFollowers);
      setNotifyMessages(prefs.notifications.messages);

      const { data, error } = await supabase
        .from("profiles")
        .select("is_private, message_privacy, online_visibility")
        .eq("id", nextSession.user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        setPrivacyError("Unable to load privacy settings.");
      } else {
        setIsPrivate(Boolean(data?.is_private));
        const resolvedPrivacy = data?.message_privacy
          ? normalizeMessagePrivacy(data.message_privacy)
          : prefs.messagePrivacy;

        setMessagePrivacy(resolvedPrivacy);

        if (resolvedPrivacy !== prefs.messagePrivacy) {
          updateUserSettingsPreferences({ messagePrivacy: resolvedPrivacy });
        }

        setOnlineVisibility(normalizeOnlineVisibility(data?.online_visibility));
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const handlePrivateToggle = async (checked: boolean) => {
    if (!session?.user) {
      return;
    }

    setSavingPrivacy(true);
    setPrivacyError(null);
    setIsPrivate(checked);

    const { error } = await supabase.from("profiles").update({ is_private: checked }).eq("id", session.user.id);

    if (error) {
      setIsPrivate(!checked);
      setPrivacyError("Unable to update private account setting.");
    }

    setSavingPrivacy(false);
  };

  const persistNotifications = (patch: Partial<{
    likes: boolean;
    comments: boolean;
    newFollowers: boolean;
    messages: boolean;
  }>) => {
    updateUserSettingsPreferences({ notifications: patch });
  };

  const handleMessagePrivacyChange = (value: string) => {
    const next = normalizeMessagePrivacy(value) as MessagePrivacy;
    setMessagePrivacy(next);
    updateUserSettingsPreferences({ messagePrivacy: next });

    if (session?.user) {
      void saveProfileMessagePrivacy(session.user.id, next).then((result) => {
        if (result.error) {
          setPrivacyError("Unable to update message privacy.");
        }
      });
    }
  };

  const handleOnlineVisibilityChange = (value: string) => {
    const next = normalizeOnlineVisibility(value);
    setOnlineVisibility(next);

    if (session?.user) {
      void saveProfileOnlineVisibility(session.user.id, next).then((result) => {
        if (result.error) {
          setPrivacyError("Unable to update online visibility.");
        }
      });
    }
  };

  const handleSaveLanguage = async () => {
    if (draftLanguage === language) {
      return;
    }

    setSavingLanguage(true);
    setLanguageSaved(false);

    updateUserSettingsPreferences({ language: draftLanguage });
    applyDocumentLanguage(draftLanguage);
    await setLocale(resolveI18nLocale(draftLanguage));

    if (session?.user) {
      await saveProfileLanguage(session.user.id, resolveI18nLocale(draftLanguage));
    }

    setLanguage(draftLanguage);
    setSavingLanguage(false);
    setLanguageSaved(true);
  };

  const handleAccentPreview = (value: string) => {
    if (!isAccentColorCode(value)) {
      return;
    }

    setDraftAccentColor(value);
    setThemeSaved(false);
    applyThemeAccent(value);
  };

  const handleSaveTheme = async () => {
    if (draftAccentColor === accentColor) {
      return;
    }

    setSavingTheme(true);
    setThemeSaved(false);

    updateUserSettingsPreferences({ accentColor: draftAccentColor });
    applyThemeAccent(draftAccentColor);

    if (session?.user) {
      await supabase.auth.updateUser({ data: { accent_color: draftAccentColor } });
    }

    setAccentColor(draftAccentColor);
    setSavingTheme(false);
    setThemeSaved(true);
  };

  const localizedPrivacyError = localizeUserMessage(t, privacyError);
  const signedInIdentity = session?.user?.user_metadata?.username
    ? `@${session.user.user_metadata.username}`
    : t("settings.yourAccount");

  if (loading) {
    return (
      <SettingsScreenLayout>
          <SettingsPageHeader title={t("settings.title")} />
          <p className="px-1 text-sm text-muted">{t("settings.loading")}</p>
      </SettingsScreenLayout>
    );
  }

  return (
    <SettingsScreenLayout>
        <SettingsPageHeader title={t("settings.title")} />

        <SettingsSection title={t("settings.account")}>
          <SettingsRow href="/profile/edit" label={t("settings.editProfile")} icon={UserPen} />
          <SettingsRow href="/settings/change-email" label={t("settings.changeEmail")} icon={Mail} />
          <SettingsRow href="/settings/change-password" label={t("settings.changePassword")} icon={KeyRound} />
        </SettingsSection>

        <SettingsSection title={t("settings.privacy")}>
          <SettingsToggleRow
            label={t("settings.privateAccount")}
            checked={isPrivate}
            disabled={savingPrivacy}
            onChange={(checked) => void handlePrivateToggle(checked)}
          />
          <SettingsSelectRow
            label={t("settings.whoCanMessage")}
            value={messagePrivacy}
            options={messagePrivacyOptions}
            onChange={handleMessagePrivacyChange}
          />
          <SettingsSelectRow
            label={t("settings.whoCanSeeOnline")}
            value={onlineVisibility}
            options={onlineVisibilityOptions}
            onChange={handleOnlineVisibilityChange}
          />
          <SettingsRow href="/settings/blocked" label={t("settings.blockedUsers")} icon={Users} />
        </SettingsSection>

        {localizedPrivacyError ? (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{localizedPrivacyError}</p>
        ) : null}

        <SettingsSection title={t("settings.notifications")}>
          <SettingsToggleRow
            label={t("settings.notifyLikes")}
            checked={notifyLikes}
            onChange={(checked) => {
              setNotifyLikes(checked);
              persistNotifications({ likes: checked });
            }}
          />
          <SettingsToggleRow
            label={t("settings.notifyComments")}
            checked={notifyComments}
            onChange={(checked) => {
              setNotifyComments(checked);
              persistNotifications({ comments: checked });
            }}
          />
          <SettingsToggleRow
            label={t("settings.notifyFollowers")}
            checked={notifyFollowers}
            onChange={(checked) => {
              setNotifyFollowers(checked);
              persistNotifications({ newFollowers: checked });
            }}
          />
          <SettingsToggleRow
            label={t("settings.notifyMessages")}
            checked={notifyMessages}
            onChange={(checked) => {
              setNotifyMessages(checked);
              persistNotifications({ messages: checked });
            }}
          />
          {pushSupported ? (
            <div className="space-y-2 border-t border-white/10 px-4 py-3.5">
              <button
                type="button"
                disabled={enablingPush}
                onClick={() => {
                  setEnablingPush(true);
                  setPushStatus(null);
                  void requestPushPermission().then((result) => {
                    setEnablingPush(false);

                    if (!result) {
                      setPushStatus(t("notifications.pushEnabled"));
                      return;
                    }

                    if (result === "denied") {
                      setPushStatus(t("notifications.pushDenied"));
                      return;
                    }

                    if (result === "unsupported") {
                      setPushStatus(t("notifications.pushUnsupported"));
                      return;
                    }

                    if (result === "missing_vapid") {
                      setPushStatus(t("notifications.pushMissingVapid"));
                      return;
                    }

                    setPushStatus(result);
                  });
                }}
                className={settingsPrimaryButtonClass}
              >
                {enablingPush ? t("common.saving") : t("notifications.enablePush")}
              </button>
              <p className="text-xs text-muted">{t("notifications.enablePushDesc")}</p>
              {pushStatus ? <p className={settingsSuccessMessageClass}>{pushStatus}</p> : null}
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t("settings.security")}>
          <SettingsRow href="/settings/sessions" label={t("settings.sessions.title")} icon={Smartphone} />
          <SettingsRow
            href="/settings/delete-account"
            label={t("settings.delete.title")}
            icon={Trash2}
            destructive
          />
        </SettingsSection>

        <SettingsSection title={t("settings.language")}>
          <SettingsSelectRow
            label={t("settings.appLanguage")}
            value={draftLanguage}
            options={APP_LANGUAGES.map((option) => ({
              value: option.code,
              label: option.nativeLabel,
            }))}
            onChange={(value) => {
              setDraftLanguage(value as AppLanguageCode);
              setLanguageSaved(false);
            }}
          />
          <div className="space-y-3 px-4 pb-3.5">
            <button
              type="button"
              disabled={savingLanguage || draftLanguage === language}
              onClick={() => void handleSaveLanguage()}
              className={settingsPrimaryButtonClass}
            >
              {savingLanguage ? t("common.saving") : t("settings.saveLanguage")}
            </button>
            {languageSaved ? (
              <p className={settingsSuccessMessageClass}>{t("settings.languageSaved")}</p>
            ) : (
              <p className="text-xs leading-relaxed text-muted">{t("settings.languageHelper")}</p>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title={t("settings.appearance")}>
          <SettingsInfoRow label={t("settings.darkMode")} />
          <SettingsThemePicker
            label={t("settings.themeColor")}
            value={draftAccentColor}
            options={themeOptions}
            onChange={handleAccentPreview}
          />
          <div className="space-y-3 px-4 pb-3.5">
            <button
              type="button"
              disabled={savingTheme || draftAccentColor === accentColor}
              onClick={() => void handleSaveTheme()}
              className={settingsPrimaryButtonClass}
            >
              {savingTheme ? t("common.saving") : t("settings.saveTheme")}
            </button>
            {themeSaved ? (
              <p className={settingsSuccessMessageClass}>{t("settings.themeSaved")}</p>
            ) : (
              <p className="text-xs leading-relaxed text-muted">{t("settings.themeHelper")}</p>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title={t("settings.help")}>
          <SettingsRow
            href="mailto:support@spotdrop.app"
            label={t("settings.contactSupport")}
            description={t("settings.contactSupportDesc")}
            icon={CircleHelp}
          />
          <SettingsRow
            href="/visit"
            label={t("settings.cityRoomsGuide")}
            description={t("settings.cityRoomsGuideDesc")}
            icon={Eye}
          />
        </SettingsSection>

        <SettingsSection title={t("auth.signOut")}>
          <div className="px-4 py-3.5">
            <SignOutButton className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/15" />
            <p className="mt-2 text-center text-xs text-muted">{t("settings.signOutHint")}</p>
          </div>
        </SettingsSection>

        <p className="px-1 text-center text-[11px] text-muted">
          {t("settings.signedInAs", { identity: signedInIdentity })} {t("settings.emailPrivate")}
        </p>
    </SettingsScreenLayout>
  );
}
