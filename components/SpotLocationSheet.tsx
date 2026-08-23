"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, X } from "lucide-react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import {
  localizeCityByEnglishName,
  localizeCountryByEnglishName,
  localizeRegionByEnglishName,
} from "@/lib/i18n/localizeGeo";
import {
  formatSpotLocationDisplay,
  hasSpotCoordinates,
  inferSpotRegionFromAddress,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";
import { getDisplayStreetName } from "@/lib/spotStreetName";
import { recordSpotSeeVisit } from "@/lib/spotRanking";
import { useNavigationAppChooser } from "@/lib/useNavigationAppChooser";
import type { SpotLocationViewerContext } from "@/lib/spotVisitContext";

function getCopyableAddress(spot: SpotLocationDisplayFields, locale: import("@/lib/i18n/locales").I18nLocale) {
  return formatSpotLocationDisplay(spot, locale);
}

/** Fallback free-text destination for the navigation chooser when there are no coordinates. */
function resolveSpotAddressQuery(location: SpotLocationDisplayFields) {
  return (
    getDisplayStreetName(location.spot_address) ||
    [location.spot_city, location.spot_country].filter(Boolean).join(", ") ||
    null
  );
}

export default function SpotLocationSheet({
  spot,
  viewerContext,
  onClose,
}: {
  spot: SpotLocationDisplayFields | null;
  viewerContext?: SpotLocationViewerContext;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { session, loading: authLoading } = useAuthSession();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = Boolean(spot);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // The visit only counts here — when the user actually opens the map and
  // the Spot's marker is shown at its real coordinates — never just for
  // tapping "See Spot" to open this sheet.
  const handleOpenMaps = useCallback(() => {
    if (!spot?.id) {
      return;
    }

    // Read auth live at click time rather than trusting whatever was
    // captured when "See Spot" first opened this sheet — auth can finish
    // resolving while the sheet is still open.
    void recordSpotSeeVisit({
      postId: spot.id,
      viewerId: session?.user?.id ?? viewerContext?.viewerId ?? null,
      ownerId: viewerContext?.ownerId ?? null,
      authResolved: !authLoading,
      currentVisitedCount: viewerContext?.currentVisitedCount,
    });
  }, [authLoading, session?.user?.id, spot, viewerContext]);

  const navigationChooser = useNavigationAppChooser(handleOpenMaps);

  // Close the chooser when the spot changes (e.g. swiping to a different
  // Spot while it happened to be open) — must depend on `close` itself
  // (stable via useCallback), never on the whole `navigationChooser` object.
  // useNavigationAppChooser returns a fresh `{ open, close, sheet }` object
  // literal on every render, so depending on `navigationChooser` made this
  // effect re-run after every render — including the one right after
  // tapping "Open in Maps", closing the chooser in the same tick it opened,
  // before the browser ever painted it. This is why the button appeared to
  // do nothing at all.
  useEffect(() => {
    navigationChooser.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot?.id, navigationChooser.close]);

  if (!spot || !mounted) {
    return null;
  }

  const copyableAddress = getCopyableAddress(spot, locale);
  const navigationLabel = spot.spot_name?.trim() || spot.placeName?.trim() || null;
  const hasCoordinates = hasSpotCoordinates(spot);
  const addressQuery = hasCoordinates ? null : resolveSpotAddressQuery(spot);
  const canNavigate = hasCoordinates || Boolean(addressQuery);

  // Always the chooser — coordinates when available (preferred, most
  // accurate), otherwise the address/city/country as a free-text query. The
  // shared hook/sheet decides which provider actually gets used.
  const handleNavigate = () => {
    console.log("[SpotLocationSheet] Open in Maps button clicked", { spotId: spot.id });
    navigationChooser.open({
      latitude: hasCoordinates ? Number(spot.spot_latitude) : null,
      longitude: hasCoordinates ? Number(spot.spot_longitude) : null,
      label: navigationLabel,
      address: addressQuery,
      city: spot.spot_city,
      country: spot.spot_country,
    });
  };

  const handleCopyAddress = async () => {
    if (!copyableAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyableAddress);
      showToast("Address copied");
    } catch {
      showToast("Unable to copy address");
    }
  };

  const region = inferSpotRegionFromAddress({
    address: spot.spot_address,
    city: spot.spot_city,
    country: spot.spot_country,
  });
  const localizedCity = spot.spot_city
    ? localizeCityByEnglishName(locale, spot.spot_city, spot.spot_country) ?? spot.spot_city
    : null;
  const localizedRegion = region
    ? localizeRegionByEnglishName(locale, region, spot.spot_country) ?? region
    : null;
  const localizedCountry = spot.spot_country
    ? localizeCountryByEnglishName(locale, spot.spot_country) ?? spot.spot_country
    : null;

  const displayStreet = getDisplayStreetName(spot.spot_address);
  const hasAnyDetails = Boolean(
    displayStreet ||
      spot.spot_city?.trim() ||
      spot.spot_country?.trim() ||
      hasSpotCoordinates(spot)
  );

  const sheet = (
    <div className={`${bottomSheetLayout.overlay} z-[200]`}>
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label="Close spot location"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-location-title"
        data-bottom-sheet-panel
        className={`${bottomSheetLayout.panel} max-w-md sd-modal-panel`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center justify-between px-5 pt-3 sm:px-5 sm:pt-5">
          <p id="spot-location-title" className="text-sm font-semibold text-white">
            Spot location
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} space-y-3 px-5 py-4`}>
          {!hasAnyDetails ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-sm text-white/90">Location details unavailable.</p>
            </div>
          ) : null}

          {displayStreet ? (
            <div className="rounded-2xl border border-accent/20 bg-accent/[0.06] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Address</p>
                {copyableAddress ? (
                  <button
                    type="button"
                    onClick={() => void handleCopyAddress()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10 active:opacity-90"
                    aria-label="Copy address"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    Copy
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-white/90">{displayStreet}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {localizedCity ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("search.city")}</p>
                <p className="mt-1 text-sm text-white/90">{localizedCity}</p>
              </div>
            ) : null}

            {localizedRegion ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("spotLocation.region")}</p>
                <p className="mt-1 text-sm text-white/90">{localizedRegion}</p>
              </div>
            ) : null}
          </div>

          {localizedCountry ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t("search.country")}</p>
              <p className="mt-1 text-sm text-white/90">{localizedCountry}</p>
            </div>
          ) : null}
        </div>

        {canNavigate ? (
          <div className={`${bottomSheetLayout.footer} px-5 py-3`}>
            <button
              type="button"
              onClick={handleNavigate}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-background transition hover:brightness-110 active:opacity-90"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open in Maps
            </button>
          </div>
        ) : null}
      </div>

      {navigationChooser.sheet}

      {toastMessage ? (
        <div
          className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 z-[210] -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-black shadow-lg">
            {toastMessage}
          </p>
        </div>
      ) : null}
    </div>
  );

  return createPortal(sheet, document.body);
}

