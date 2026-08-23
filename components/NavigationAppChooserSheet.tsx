"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import {
  getOrderedNavigationProviderOptions,
  getRecommendedNavigationProvider,
  isNavigationProvider,
  openNavigationApp,
  type NavigationProvider,
} from "@/lib/navigationApps";
import { loadUserSettingsPreferences, updateUserSettingsPreferences } from "@/lib/settingsPreferences";

export type NavigationAppChooserTarget = {
  /** Preferred — most accurate. Omit when no GPS fix/coordinates are available. */
  latitude?: number | null;
  longitude?: number | null;
  /** Free-text fallback used when coordinates aren't available. */
  label?: string | null;
  address?: string | null;
  /** Combined with `address`/`country` into Apple Maps' query; not otherwise used. */
  city?: string | null;
  /** English canonical country name (e.g. "Switzerland") — Recommended badge, and combined into Apple Maps' query. */
  country?: string | null;
};

type NavigationAppChooserSheetProps = {
  target: NavigationAppChooserTarget | null;
  onClose: () => void;
  /** Fired right before a provider actually opens — e.g. to record a Spot "see" visit. */
  onNavigate?: (provider: NavigationProvider) => void;
};

export default function NavigationAppChooserSheet({
  target,
  onClose,
  onNavigate,
}: NavigationAppChooserSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [remember, setRemember] = useState(false);
  const isOpen = Boolean(target);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!target) {
      return;
    }

    // Reflect whatever is already saved — checked when a provider is
    // remembered, so the box always shows the true current state rather
    // than resetting to unchecked on every open.
    setRemember(isNavigationProvider(loadUserSettingsPreferences().navigationApp));
  }, [target]);

  if (!isOpen || !target || !mounted) {
    return null;
  }

  // A remembered provider (if any) is only ever a fast-path default — it
  // never skips this sheet. It just moves to the front and wins the
  // Recommended badge over the country-based guess.
  const rememberedPreference = loadUserSettingsPreferences().navigationApp;
  const preferredProvider = isNavigationProvider(rememberedPreference) ? rememberedPreference : null;
  const recommended = preferredProvider ?? getRecommendedNavigationProvider(target.country);
  const orderedOptions = getOrderedNavigationProviderOptions(preferredProvider);

  const handleChoose = (provider: NavigationProvider) => {
    onNavigate?.(provider);

    // Checked → save this pick as the new remembered provider (even if it
    // replaces a different one). Unchecked → explicitly clear any saved
    // preference, so unchecking always means "stop remembering."
    updateUserSettingsPreferences({ navigationApp: remember ? provider : "ask" });

    openNavigationApp(provider, {
      latitude: target.latitude,
      longitude: target.longitude,
      label: target.label,
      address: target.address,
      city: target.city,
      country: target.country,
    });
    onClose();
  };

  const sheet = (
    <div className={`${bottomSheetLayout.overlay} z-[220]`}>
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="navigation-chooser-title"
        data-bottom-sheet-panel
        className={bottomSheetLayout.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-4">
          <p id="navigation-chooser-title" className="text-sm font-semibold text-white">
            {t("navigation.chooser.title")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} px-2 py-2`}>
          {orderedOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleChoose(option.id)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left transition hover:bg-white/5 active:bg-white/10"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-primary">
                <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-white">{option.label}</span>
              {recommended === option.id ? (
                <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  {t("navigation.chooser.recommended")}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className={`${bottomSheetLayout.footer} px-5 py-3`}>
          <label className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-5 w-5 shrink-0 rounded border-white/20 bg-[#050816] text-primary focus:ring-primary/30"
            />
            <span className="text-sm text-white/90">{t("navigation.chooser.rememberChoice")}</span>
          </label>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
