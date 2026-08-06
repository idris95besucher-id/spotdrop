"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translateMessage, type TranslationKey } from "@/lib/i18n/messages";
import { resolveI18nLocale, type I18nLocale } from "@/lib/i18n/locales";
import {
  resolveGuestAppLocale,
  writeStoredAppLocale,
} from "@/lib/i18n/appLocaleStorage";
import { loadProfileLanguage, saveProfileLanguage } from "@/lib/i18n/profileLanguage";
import { applyDocumentLanguage } from "@/lib/languages";
import { supabase } from "@/lib/supabaseClient";

type I18nContextValue = {
  locale: I18nLocale;
  ready: boolean;
  setLocale: (locale: I18nLocale) => Promise<void>;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readBootLocale(): I18nLocale {
  if (typeof window === "undefined") {
    return "en";
  }

  const fromDataset = window.document.documentElement.dataset.locale;
  if (fromDataset === "en" || fromDataset === "ru" || fromDataset === "de") {
    return fromDataset;
  }

  return resolveGuestAppLocale({ persistIfMissing: true });
}

function markI18nReady(locale: I18nLocale) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.lang = locale;
  root.dataset.locale = locale;
  root.dataset.i18nReady = "1";
  delete root.dataset.i18nPending;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<I18nLocale>(readBootLocale);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const guestLocale = resolveGuestAppLocale({ persistIfMissing: true });
    setLocaleState(guestLocale);
    applyDocumentLanguage(guestLocale);
    markI18nReady(guestLocale);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyAuthenticatedLocale = async (userId: string) => {
      const profileLanguage = await loadProfileLanguage(userId);
      if (!profileLanguage || cancelled) {
        return;
      }

      // profiles.language wins for signed-in users; never overwrite it with device language.
      setLocaleState(profileLanguage);
      writeStoredAppLocale(profileLanguage);
      applyDocumentLanguage(profileLanguage);
      markI18nReady(profileLanguage);
    };

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        await applyAuthenticatedLocale(user.id);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.id) {
        return;
      }

      void applyAuthenticatedLocale(session.user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setLocale = useCallback(async (nextLocale: I18nLocale) => {
    const locale = resolveI18nLocale(nextLocale);
    setLocaleState(locale);
    writeStoredAppLocale(locale);
    applyDocumentLanguage(locale);
    markI18nReady(locale);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await saveProfileLanguage(user.id, locale);
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
