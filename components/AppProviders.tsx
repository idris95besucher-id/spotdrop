"use client";

import { useEffect, type ReactNode } from "react";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import ChatNotificationsProvider from "@/components/ChatNotificationsProvider";
import CreateMenuProvider from "@/components/CreateMenuProvider";
import NotificationsProvider from "@/components/NotificationsProvider";
import PostViewerProvider from "@/components/PostViewerProvider";
import SpotLocationModalProvider from "@/components/SpotLocationModalProvider";
import { I18nProvider } from "@/components/I18nProvider";
import { applyDocumentLanguage } from "@/lib/languages";
import { loadUserSettingsPreferences } from "@/lib/settingsPreferences";
import { applyThemeAccent } from "@/lib/themeAccent";
import type { AppLanguageCode } from "@/lib/languages";
import PasswordRecoveryRedirect from "@/components/PasswordRecoveryRedirect";
import { MobileBottomNav } from "@/components/MainNavigation";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { MOBILE_APP_ROOT_CLASS } from "@/lib/mobileLayout";

export default function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prefs = loadUserSettingsPreferences();
    applyDocumentLanguage(prefs.language as AppLanguageCode);
    applyThemeAccent(prefs.accentColor);
  }, []);

  return (
    <I18nProvider>
      <PasswordRecoveryRedirect />
      <AuthSessionProvider>
        <CreateMenuProvider>
          <ChatNotificationsProvider>
            <NotificationsProvider>
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
