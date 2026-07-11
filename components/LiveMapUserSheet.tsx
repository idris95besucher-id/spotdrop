"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import LiveMapUserPresenceLine from "@/components/LiveMapUserPresenceLine";
import { localizeCityByEnglishName, localizeCountryByEnglishName } from "@/lib/i18n/localizeGeo";
import { auditLocationLocaleOutput } from "@/lib/i18n/localizeGeoAudit";
import type { I18nLocale } from "@/lib/i18n/locales";
import { checkCanMessageUser } from "@/lib/messagePrivacy";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/lib/mobileLayout";
import type { LiveMapUser } from "@/lib/userLiveLocation";
import { supabase } from "@/lib/supabaseClient";

type LiveMapUserSheetProps = {
  user: LiveMapUser | null;
  /** When true (Map page), clear the fixed SpotDrop bottom nav. */
  embedded?: boolean;
  onClose: () => void;
};

type VisibleViewport = {
  /** Top of the visible viewport in layout coordinates (Safari URL bar). */
  offsetTop: number;
  /** Visible height in px (visualViewport / 100dvh). */
  height: number | null;
  /**
   * Layout pixels covered below the visible viewport
   * (Safari toolbar / home-indicator overlap outside visualViewport).
   */
  bottomInset: number;
};

function locationLine(user: LiveMapUser, locale: I18nLocale) {
  const city = user.city
    ? localizeCityByEnglishName(locale, user.city, user.country) ?? user.city
    : null;
  const country = user.country
    ? localizeCountryByEnglishName(locale, user.country) ?? user.country
    : null;
  const parts = [city, country].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const line = parts.join(", ");
  auditLocationLocaleOutput(locale, line, {
    kind: "location-line",
    source: "LiveMapUserSheet.locationLine",
    city: user.city ?? null,
    country: user.country ?? null,
  });
  return line;
}

function readVisibleViewport(): VisibleViewport {
  if (typeof window === "undefined") {
    return { offsetTop: 0, height: null, bottomInset: 0 };
  }

  const viewport = window.visualViewport;

  if (!viewport) {
    return { offsetTop: 0, height: Math.round(window.innerHeight), bottomInset: 0 };
  }

  return {
    offsetTop: Math.round(viewport.offsetTop),
    height: Math.round(viewport.height),
    bottomInset: Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)),
  };
}

export default function LiveMapUserSheet({
  user,
  embedded = false,
  onClose,
}: LiveMapUserSheetProps) {
  const { t, locale } = useI18n();
  const [canMessage, setCanMessage] = useState(false);
  const [viewport, setViewport] = useState<VisibleViewport>(() => readVisibleViewport());

  const syncViewport = useCallback(() => {
    setViewport(readVisibleViewport());
  }, []);

  useEffect(() => {
    syncViewport();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", syncViewport);
    visualViewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);

    return () => {
      visualViewport?.removeEventListener("resize", syncViewport);
      visualViewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, [syncViewport]);

  useEffect(() => {
    if (!user) {
      setCanMessage(false);
      return;
    }

    let cancelled = false;

    const loadMessagePermission = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (cancelled || !authUser || authUser.id === user.user_id) {
        setCanMessage(false);
        return;
      }

      const permission = await checkCanMessageUser(authUser.id, user.user_id);

      if (!cancelled) {
        setCanMessage(permission.allowed);
      }
    };

    void loadMessagePermission();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return null;
  }

  const place = locationLine(user, locale);

  /**
   * Bottom clearance inside the visible viewport:
   * - Map (`embedded`): SpotDrop nav (54px) + iPhone safe-area + breathing room
   * - Otherwise: safe-area only
   * Safari browser toolbar is handled by anchoring the overlay to visualViewport
   * (offsetTop / height / bottomInset), not by padding here.
   */
  const sheetBottomPadding = embedded
    ? `calc(${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px) + 12px)`
    : "max(1.25rem, env(safe-area-inset-bottom, 0px))";

  const overlayStyle: CSSProperties = {
    top: viewport.offsetTop,
    height: viewport.height != null ? `${viewport.height}px` : "100dvh",
    bottom: "auto",
    // When visualViewport is shorter than the layout viewport (Safari toolbar),
    // keep the overlay flush with the visible area (bottomInset is already
    // reflected by height + offsetTop; no extra margin needed).
  };

  const sheetMaxHeight =
    viewport.height != null
      ? `${Math.max(240, viewport.height - 8)}px`
      : "calc(100dvh - env(safe-area-inset-top, 0px) - 8px)";

  return (
    <div
      className="fixed inset-x-0 z-50 flex items-end justify-center md:inset-0 md:items-center md:p-4"
      style={overlayStyle}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={t("map.closeProfileCard")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-map-user-sheet-title"
        className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-950 shadow-2xl md:max-h-[min(85dvh,36rem)] md:rounded-3xl"
        style={{
          maxHeight: sheetMaxHeight,
          paddingBottom: sheetBottomPadding,
        }}
      >
        <div className="flex shrink-0 justify-center pt-2 md:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/40 bg-slate-800 text-white">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-6 w-6 text-slate-400" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <p
                  id="live-map-user-sheet-title"
                  className="truncate text-base font-semibold text-white"
                >
                  @{user.username}
                </p>
                {place ? <p className="truncate text-sm text-slate-400">{place}</p> : null}
                <LiveMapUserPresenceLine
                  user={user}
                  screen="map-user-sheet"
                  className="mt-1 text-xs font-medium"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div
            className={`grid gap-2.5 px-4 pb-1 ${canMessage ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
          >
            <Link
              href={`/user?id=${user.user_id}`}
              className="inline-flex w-full items-center justify-center rounded-full bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              onClick={onClose}
            >
              {t("profile.viewProfile")}
            </Link>
            {canMessage ? (
              <Link
                href={`/dm?id=${user.user_id}`}
                className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                onClick={onClose}
              >
                {t("profile.message")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
