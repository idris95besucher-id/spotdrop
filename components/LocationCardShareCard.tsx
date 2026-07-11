"use client";

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { spotLocationCardFontCss } from "@/lib/spotLocationCardStyles";
import type { LocationCardSharePayload } from "@/lib/locationCardShareMessage";

type LocationCardShareCardProps = {
  card: LocationCardSharePayload;
  compact?: boolean;
  footer?: ReactNode;
};

export default function LocationCardShareCard({
  card,
  compact = false,
  footer = null,
}: LocationCardShareCardProps) {
  const displayText = card.cardText.trim() || "SpotDrop";

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0B1026] ${compact ? "" : "shadow-lg shadow-black/30"}`}>
      <div className={`relative overflow-hidden bg-black ${compact ? "aspect-[4/5] max-h-56" : "aspect-[4/5]"}`}>
        <img
          src={card.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      <div className={`space-y-2 ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
        <p
          className={`line-clamp-4 whitespace-pre-wrap text-white/95 ${spotLocationCardFontCss(card.fontStyle)} ${
            compact ? "text-sm" : "text-base"
          }`}
        >
          {displayText}
        </p>

        <p className="flex items-start gap-1.5 text-xs text-slate-300">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
          <span className="line-clamp-2">{card.locationLabel}</span>
        </p>

        {footer}
      </div>
    </div>
  );
}
