"use client";

import { MapPinned } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { CityRoomMapMarkPayload } from "@/lib/cityRoomMapMarkMessage";
import {
  mapMarkCategoryIcon,
  mapMarkCategoryLabelKey,
  normalizeMapMarkCategory,
} from "@/lib/mapMarkCategories";

type MapMarkSharePreviewProps = {
  mark: CityRoomMapMarkPayload;
};

/** Compact preview shown atop the "Share Mark" menu — same content the recipient's card will show. */
export default function MapMarkSharePreview({ mark }: MapMarkSharePreviewProps) {
  const { t } = useI18n();
  const category = normalizeMapMarkCategory(mark.category);
  const CategoryIcon = mapMarkCategoryIcon(category);
  const placeLine = mark.placeName?.trim() || mark.municipality?.trim() || t("map.selectedLocation");

  return (
    <div className="space-y-2">
      {mark.photoUrl ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
          <img src={mark.photoUrl} alt="" loading="lazy" className="h-28 w-full object-cover" />
        </div>
      ) : null}

      <div className="min-w-0">
        <p className="whitespace-pre-wrap text-sm font-semibold text-white">{mark.text}</p>

        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-cyan-300/80">
          <CategoryIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t(mapMarkCategoryLabelKey(category))}
        </div>

        {mark.creatorUsername ? (
          <p className="mt-1 text-xs text-slate-400">
            {t("map.shareMark.createdBy", { username: mark.creatorUsername })}
          </p>
        ) : null}

        <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
          <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
          <span>
            {placeLine}
            <span className="mt-0.5 block text-slate-500">
              {mark.latitude.toFixed(5)}, {mark.longitude.toFixed(5)}
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}
