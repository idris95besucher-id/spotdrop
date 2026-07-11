"use client";

import { MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { LocationCardSharePayload } from "@/lib/locationCardShareMessage";

export type ChatLocationCardPreviewProps = {
  imageUrl: string;
  title?: string | null;
  locationLabel?: string | null;
  onPress: () => void;
  disabled?: boolean;
  seeSpotLabel?: string;
  className?: string;
};

export function chatLocationCardPreviewFromPayload(card: LocationCardSharePayload) {
  return {
    imageUrl: card.imageUrl,
    title: card.cardText.trim() || null,
    locationLabel: card.locationLabel.trim() || null,
  };
}

export default function ChatLocationCardPreview({
  imageUrl,
  title = null,
  locationLabel = null,
  onPress,
  disabled = false,
  seeSpotLabel,
  className = "",
}: ChatLocationCardPreviewProps) {
  const { t } = useI18n();
  const openLabel = seeSpotLabel ?? t("spotLocationCard.seeSpot");

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className={`group block w-full max-w-[13.75rem] text-left transition active:scale-[0.99] disabled:opacity-60 ${className}`}
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#121a2e] to-[#0b1020] p-2 shadow-md shadow-black/25 ring-1 ring-white/[0.06] transition group-hover:border-white/15 group-hover:ring-white/10">
        <div className="mx-auto flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl bg-[#060a14]">
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>

        <div className="mt-2 space-y-1 px-0.5 pb-0.5">
          {title ? (
            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{title}</p>
          ) : null}

          {locationLabel ? (
            <p className="flex min-w-0 items-center gap-1 text-[11px] leading-tight text-slate-400">
              <MapPin className="h-3 w-3 shrink-0 text-cyan-400/90" strokeWidth={2} aria-hidden />
              <span className="truncate">{locationLabel}</span>
            </p>
          ) : null}

          <p className="pt-0.5 text-[11px] font-semibold text-primary transition group-hover:text-cyan-200">
            {openLabel}
          </p>
        </div>
      </div>
    </button>
  );
}
