"use client";

import { useEffect, type ReactNode } from "react";
import AuthSessionGuard from "@/components/AuthSessionGuard";
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

export default function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prefs = loadUserSettingsPreferences();
    applyDocumentLanguage(prefs.language as AppLanguageCode);
    applyThemeAccent(prefs.accentColor);
  }, []);

  return (
    <I18nProvider>
      <PasswordRecoveryRedirect />
      <AuthSessionGuard>
        <CreateMenuProvider>
          <ChatNotificationsProvider>
            <NotificationsProvider>
            <SpotLocationModalProvider>
              <PostViewerProvider>{children}</PostViewerProvider>
            </SpotLocationModalProvider>
            </NotificationsProvider>
          </ChatNotificationsProvider>
        </CreateMenuProvider>
      </AuthSessionGuard>
    </I18nProvider>
  );
}
