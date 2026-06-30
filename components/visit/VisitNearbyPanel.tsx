"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, UserRound } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeError } from "@/lib/i18n/localizeError";
import { filterRecipientsAllowedToMessage } from "@/lib/messagePrivacy";
import {
  fetchLiveMapUsers,
  filterOnlineLiveMapUsers,
  LIVE_LOCATION_ERROR,
  LIVE_LOCATION_PUSH_MS,
  type LiveMapUser,
} from "@/lib/userLiveLocation";
import { usePresenceOnlineIds } from "@/lib/usePresenceOnlineIds";
import LiveMapUserPresenceLine from "@/components/LiveMapUserPresenceLine";
import { supabase } from "@/lib/supabaseClient";
import type { I18nLocale } from "@/lib/i18n/locales";
import { localizeCityByEnglishName, localizeCountryByEnglishName } from "@/lib/i18n/localizeGeo";
import { auditLocationLocaleOutput } from "@/lib/i18n/localizeGeoAudit";
import { MOBILE_PANEL_SCROLL_CLASS } from "@/lib/mobileLayout";

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
    source: "VisitNearbyPanel.locationLine",
    city: user.city ?? null,
    country: user.country ?? null,
  });
  return line;
}

function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function VisitNearbyPanel() {
  const { t, locale } = useI18n();
  const { presenceOnlineIds, freshnessTick } = usePresenceOnlineIds();
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<LiveMapUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerCoords, setViewerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [messageableUserIds, setMessageableUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id ?? null);
      setAuthChecked(true);
    };

    void loadAuth();
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setViewerCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setViewerCoords(null);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 }
    );
  }, []);

  const loadUsers = useCallback(async () => {
    if (!userId) {
      setUsers([]);
      setMessageableUserIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchLiveMapUsers();

    if (result.error === LIVE_LOCATION_ERROR.NOT_AUTHENTICATED) {
      setUsers([]);
      setMessageableUserIds(new Set());
      setLoading(false);
      return;
    }

    if (result.error) {
      setError(result.error);
      setUsers([]);
      setMessageableUserIds(new Set());
      setLoading(false);
      return;
    }

    const visibleUsers = result.users.filter((user) => user.user_id !== userId);
    const messageableUsers = await filterRecipientsAllowedToMessage(
      userId,
      visibleUsers.map((user) => ({ id: user.user_id }))
    );

    setUsers(visibleUsers);
    setMessageableUserIds(new Set(messageableUsers.map((user) => user.id)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    void loadUsers();

    if (!userId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadUsers();
    }, LIVE_LOCATION_PUSH_MS * 2);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authChecked, loadUsers, userId]);

  const sortedUsers = useMemo(() => {
    const onlineUsers = filterOnlineLiveMapUsers(
      users.filter((user) => user.user_id !== userId),
      presenceOnlineIds,
      "visit-nearby"
    );

    if (!viewerCoords) {
      return onlineUsers;
    }

    return [...onlineUsers].sort((a, b) => {
      const distanceA = distanceKm(viewerCoords, a);
      const distanceB = distanceKm(viewerCoords, b);
      return distanceA - distanceB;
    });
  }, [freshnessTick, presenceOnlineIds, userId, users, viewerCoords]);

  if (!authChecked) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-10 text-sm text-slate-400">
        {t("common.loading")}
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <p className="text-base font-medium text-white">{t("map.error.notLoggedIn")}</p>
        <Link
          href="/auth/login"
          className="inline-flex rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          {t("auth.signIn")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">
          {localizeError(t, error) ?? error}
        </div>
      </div>
    );
  }

  if (sortedUsers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-sm font-medium text-white">{t("visit.nearbyEmptyTitle")}</p>
        <p className="mt-2 max-w-sm text-sm text-slate-400">{t("visit.nearbyEmptyBody")}</p>
      </div>
    );
  }

  return (
    <div data-mobile-panel-scroll="" className={`${MOBILE_PANEL_SCROLL_CLASS} px-4 py-4 sm:px-5`}>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {t("map.onlineNearby", { count: sortedUsers.length })}
      </p>
      <ul className="space-y-2">
        {sortedUsers.map((user) => {
          const place = locationLine(user, locale);
          const distance =
            viewerCoords != null
              ? distanceKm(viewerCoords, user)
              : null;

          return (
            <li
              key={user.user_id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3"
            >
              <Link href={`/user?id=${user.user_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/30 bg-slate-800">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-5 w-5 text-slate-400" strokeWidth={1.5} aria-hidden />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">@{user.username}</p>
                  {place ? <p className="truncate text-xs text-slate-400">{place}</p> : null}
                  <LiveMapUserPresenceLine user={user} screen="visit-nearby" />
                </div>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {distance != null ? (
                  <span className="text-[11px] font-medium text-slate-500">
                    {distance < 1 ? t("visit.nearbyDistanceMeters", { meters: Math.round(distance * 1000) }) : t("visit.nearbyDistanceKm", { km: distance.toFixed(1) })}
                  </span>
                ) : null}
                {messageableUserIds.has(user.user_id) ? (
                  <Link
                    href={`/dm?id=${user.user_id}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                    aria-label={t("profile.message")}
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
