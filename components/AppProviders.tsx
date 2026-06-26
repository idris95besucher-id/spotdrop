"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import ChatNotificationsProvider from "@/components/ChatNotificationsProvider";
import CreateMenuProvider from "@/components/CreateMenuProvider";
import NotificationsProvider from "@/components/NotificationsProvider";
import PostViewerProvider from "@/components/PostViewerProvider";
import SpotLocationModalProvider from "@/components/SpotLocationModalProvider";
import PushNotificationsBootstrap from "@/components/PushNotificationsBootstrap";
import OnlinePresenceBootstrap from "@/components/OnlinePresenceBootstrap";
import CapacitorLaunchGuard from "@/components/CapacitorLaunchGuard";
import { I18nProvider } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { applyDocumentLanguage } from "@/lib/languages";
import { loadUserSettingsPreferences } from "@/lib/settingsPreferences";
import { applyThemeAccent } from "@/lib/themeAccent";
import { initMessageNotificationSoundUnlock } from "@/lib/messageNotificationSound";
import { supabase } from "@/lib/supabaseClient";
import type { AppLanguageCode } from "@/lib/languages";
import PasswordRecoveryRedirect from "@/components/PasswordRecoveryRedirect";
import { MobileBottomNav } from "@/components/MainNavigation";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { MOBILE_APP_ROOT_CLASS } from "@/lib/mobileLayout";

export default function AppProviders({ children }: { children: ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const prefs = loadUserSettingsPreferences();
    applyDocumentLanguage(prefs.language as AppLanguageCode);
    applyThemeAccent(prefs.accentColor);
    initMessageNotificationSoundUnlock();
  }, []);

  useEffect(() => {
    void getSafeAuthSession().then((result) => {
      const nextUserId = result.session?.user?.id ?? null;
      setSessionUserId((current) => (current === nextUserId ? current : nextUserId));
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setSessionUserId((current) => (current === nextUserId ? current : nextUserId));
      setAuthReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <I18nProvider>
      <PasswordRecoveryRedirect />
      <AuthSessionProvider>
        <CreateMenuProvider>
          <ChatNotificationsProvider>
            <NotificationsProvider>
            <CapacitorLaunchGuard />
            <PushNotificationsBootstrap userId={sessionUserId} />
            <OnlinePresenceBootstrap userId={sessionUserId} authReady={authReady} />
            <SpotLocationModalProvider>
              <PostViewerProvider>
                <div className={MOBILE_APP_ROOT_CLASS}>{children}</div>
                <MobileBottomNav />
                <PwaInstallBanner />
              </PostViewerProvider>
            </SpotLocationModalProvider>
            </NotificationsProvider>
          </ChatNotificationsProvider>
        </CreateMenuProvider>
      </AuthSessionProvider>
    </I18nProvider>
  );
}
