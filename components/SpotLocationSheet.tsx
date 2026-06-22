"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, X } from "lucide-react";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import {
  formatSpotLocationDisplay,
  hasSpotCoordinates,
  inferSpotRegionFromAddress,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";

function getCopyableAddress(spot: SpotLocationDisplayFields) {
  const address = spot.spot_address?.trim();

  if (address) {
    return address;
  }

  return formatSpotLocationDisplay(spot);
}

function buildMapsUrl(location: SpotLocationDisplayFields) {
  const latitude = Number(location.spot_latitude);
  const longitude = Number(location.spot_longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  const query =
    location.spot_address?.trim() ||
    [location.spot_city, location.spot_country].filter(Boolean).join(", ");

  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return null;
}

export default function SpotLocationSheet({
  spot,
  onClose,
}: {
  spot: SpotLocationDisplayFields | null;
  onClose: () => void;
}) {
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

  if (!spot || !mounted) {
    return null;
  }

  const copyableAddress = getCopyableAddress(spot);

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

  const mapsUrl = buildMapsUrl(spot);
  const hasAnyDetails = Boolean(
    spot.spot_address?.trim() ||
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

          {spot.spot_address ? (
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
              <p className="mt-1 text-sm leading-relaxed text-white/90">{spot.spot_address}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {spot.spot_city ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">City</p>
                <p className="mt-1 text-sm text-white/90">{spot.spot_city}</p>
              </div>
            ) : null}

            {region ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Region</p>
                <p className="mt-1 text-sm text-white/90">{region}</p>
              </div>
            ) : null}
          </div>

          {spot.spot_country ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Country</p>
              <p className="mt-1 text-sm text-white/90">{spot.spot_country}</p>
            </div>
          ) : null}
        </div>

        {mapsUrl ? (
          <div className={`${bottomSheetLayout.footer} px-5 py-3`}>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-background transition hover:brightness-110 active:opacity-90"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Open in Maps
            </a>
          </div>
        ) : null}
      </div>

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

