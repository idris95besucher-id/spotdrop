"use client";

import { useEffect, useState } from "react";
import { LocateFixed, Radio } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type ChatLocationBubbleProps = {
  latitude: number;
  longitude: number;
  updatedAt: string;
  expiresAt: string | null;
  isOwnMessage: boolean;
};

function formatRelativeTime(iso: string, justNowLabel: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));

  if (seconds < 30) {
    return justNowLabel;
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function ChatLocationBubble({
  latitude,
  longitude,
  updatedAt,
  expiresAt,
  isOwnMessage,
}: ChatLocationBubbleProps) {
  const { t } = useI18n();
  const [, setTick] = useState(0);

  const isLive = Boolean(expiresAt);
  const isExpired = isLive && expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
  const isActiveLive = isLive && !isExpired;

  useEffect(() => {
    if (!isActiveLive) {
      return;
    }

    const interval = setInterval(() => setTick((value) => value + 1), 15_000);
    return () => clearInterval(interval);
  }, [isActiveLive]);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  const label = isExpired
    ? t("chatAttach.liveLocationEnded")
    : isActiveLive
      ? t("chatAttach.liveLocationLabel")
      : t("chatAttach.currentLocationLabel");

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-56 max-w-[85vw] shrink-0 overflow-hidden rounded-2xl ${
        isOwnMessage ? "rounded-br-md" : "rounded-bl-md"
      } bg-[#101a2c] ring-1 ring-white/10 transition hover:ring-white/20`}
    >
      <div className="flex h-24 w-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.18),transparent_65%)]">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
            isActiveLive ? "bg-red-500/15 text-red-300 ring-1 ring-red-400/25" : "bg-white/8 text-cyan-300 ring-1 ring-white/10"
          }`}
        >
          {isActiveLive ? (
            <Radio className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          ) : (
            <LocateFixed className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          )}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className={`text-xs font-semibold ${isExpired ? "text-slate-400" : "text-slate-100"}`}>{label}</span>
        {!isExpired ? (
          <span className="shrink-0 text-[10px] text-slate-400">
            {t("chatAttach.liveLocationUpdated", { time: formatRelativeTime(updatedAt, t("chatAttach.justNow")) })}
          </span>
        ) : null}
      </div>
    </a>
  );
}
