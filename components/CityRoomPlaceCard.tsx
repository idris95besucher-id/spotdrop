"use client";

import { ExternalLink } from "lucide-react";
import CityRoomPlacePreview from "@/components/CityRoomPlacePreview";
import { formatChatMessageTime } from "@/lib/chatDates";
import { buildPlaceMapsUrl, type CityRoomPlacePayload } from "@/lib/cityRoomPlaceMessage";

type CityRoomPlaceCardProps = {
  place: CityRoomPlacePayload;
  createdAt: string;
  editedAt?: string | null;
};

export default function CityRoomPlaceCard({ place, createdAt, editedAt }: CityRoomPlaceCardProps) {
  const mapsUrl = buildPlaceMapsUrl(place);

  return (
    <div className="relative min-w-[14rem] max-w-full rounded-2xl bg-[#122033]/95 px-3 py-2.5 ring-1 ring-white/8">
      <div className="pr-12">
        <CityRoomPlacePreview
          name={place.name}
          address={place.address}
          description={place.description}
          imageUrl={place.imageUrl}
          city={place.city}
          region={place.region}
          latitude={place.latitude}
          longitude={place.longitude}
          mapsUrl={mapsUrl}
          compact
          footer={
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/15 px-3 py-2 text-xs font-semibold text-cyan-200 ring-1 ring-primary/25 transition hover:bg-primary/25"
            >
              Open in Maps
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          }
        />
      </div>

      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] leading-none text-slate-500">
        {editedAt ? <span className="text-[9px] uppercase tracking-wide opacity-80">edited</span> : null}
        <span>{formatChatMessageTime(createdAt)}</span>
      </span>
    </div>
  );
}
