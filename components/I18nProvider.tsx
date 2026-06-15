"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translateMessage, type TranslationKey } from "@/lib/i18n/messages";
import { resolveI18nLocale, type I18nLocale } from "@/lib/i18n/locales";
import { loadProfileLanguage, saveProfileLanguage } from "@/lib/i18n/profileLanguage";
import { applyDocumentLanguage } from "@/lib/languages";
import { loadUserSettingsPreferences, updateUserSettingsPreferences } from "@/lib/settingsPreferences";
import { supabase } from "@/lib/supabaseClient";

type I18nContextValue = {
  locale: I18nLocale;
  ready: boolean;
  setLocale: (locale: I18nLocale) => Promise<void>;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<I18nLocale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const prefs = loadUserSettingsPreferences();
      let resolved = resolveI18nLocale(prefs.language);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const profileLanguage = await loadProfileLanguage(user.id);
        if (profileLanguage) {
          resolved = profileLanguage;
          updateUserSettingsPreferences({ language: profileLanguage });
        }
      }

      if (!cancelled) {
        setLocaleState(resolved);
        applyDocumentLanguage(resolved);
        setReady(true);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!session?.user) {
          return;
        }

        const profileLanguage = await loadProfileLanguage(session.user.id);
        if (profileLanguage) {
          setLocaleState(profileLanguage);
          updateUserSettingsPreferences({ language: profileLanguage });
          applyDocumentLanguage(profileLanguage);
        }
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setLocale = useCallback(async (nextLocale: I18nLocale) => {
    setLocaleState(nextLocale);
    updateUserSettingsPreferences({ language: nextLocale });
    applyDocumentLanguage(nextLocale);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await saveProfileLanguage(user.id, nextLocale);
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) => translateMessage(locale, key, values),
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      ready,
      setLocale,
      t,
    }),
    [locale, ready, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
