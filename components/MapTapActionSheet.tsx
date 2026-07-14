"use client";

import { useMemo, useState } from "react";
import { Flag, MapPinned, Navigation, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatSpotGeoLocationShortLabel } from "@/lib/spotLocationDisplay";
import type { SpotGeoLocation } from "@/lib/spotLocation";

export type MapTapAction = "directions" | "mark" | "cancel";

type MapTapActionSheetProps = {
  location: SpotGeoLocation;
  resolving: boolean;
  embedded?: boolean;
  busyAction?: MapTapAction | null;
  onAction: (action: MapTapAction) => void;
  onClose: () => void;
};

function formatMapTapAddressLabel(
  location: SpotGeoLocation,
  locale: import("@/lib/i18n/locales").I18nLocale,
  selectedLocationLabel: string
) {
  if (!location.address && !location.city && !location.country) {
    return selectedLocationLabel;
  }

  const trimmedAddress = location.address?.trim();

  if (trimmedAddress) {
    const shortAddress = trimmedAddress
      .split(",")
      .slice(0, 2)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");

    if (shortAddress) {
      return shortAddress;
    }
  }

  return formatSpotGeoLocationShortLabel(location, locale);
}

export default function MapTapActionSheet({
  location,
  resolving,
  embedded = false,
  busyAction = null,
  onAction,
  onClose,
}: MapTapActionSheetProps) {
  const { t, locale } = useI18n();
  const [pressed, setPressed] = useState<MapTapAction | null>(null);

  const addressLabel = useMemo(() => {
    if (resolving) {
      return t("map.resolvingAddress");
    }

    return formatMapTapAddressLabel(location, locale, t("map.selectedLocation"));
  }, [location, locale, resolving, t]);

  const disabled = resolving || busyAction != null;

  const run = (action: MapTapAction) => {
    if (disabled && action !== "cancel") {
      return;
    }

    setPressed(action);
    onAction(action);
  };

  const options: Array<{
    action: Exclude<MapTapAction, "cancel">;
    label: string;
    icon: typeof Navigation;
  }> = [
    { action: "directions", label: t("map.actionGoToPlace"), icon: Navigation },
    { action: "mark", label: t("map.actionMarkPlace"), icon: Flag },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label={t("map.closeSavePlace")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-tap-action-title"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl shadow-black/50"
        style={{
          paddingBottom: embedded
            ? "max(1rem, calc(env(safe-area-inset-bottom) + 54px))"
            : "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 id="map-tap-action-title" className="text-base font-semibold text-white">
              {t("map.placeActionsTitle")}
            </h2>
            <p className="mt-1.5 flex items-start gap-2 text-sm leading-relaxed text-slate-300">
              <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
              <span className={resolving ? "text-slate-400" : ""}>{addressLabel}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col px-2 py-2">
          {options.map(({ action, label, icon: Icon }) => {
            const busy = busyAction === action || pressed === action;

            return (
              <button
                key={action}
                type="button"
                disabled={disabled}
                onClick={() => run(action)}
                className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition hover:bg-white/5 active:bg-white/8 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/6 text-cyan-300 ring-1 ring-white/10">
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-white">
                  {busy ? t("common.saving") : label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => run("cancel")}
            className="mt-1 flex w-full items-center justify-center rounded-2xl px-3.5 py-3.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 active:bg-white/8"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
