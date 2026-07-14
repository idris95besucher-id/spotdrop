"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { MediaEditorItem } from "@/lib/mediaEditor";
import { SPOT_MAX_PHOTOS } from "@/lib/spotMaxPhotos";

type SpotPhotoThumbnailStripProps = {
  items: MediaEditorItem[];
  activeIndex: number;
  disabled?: boolean;
  onSelectIndex: (index: number) => void;
  onRemoveAt: (index: number) => void;
  onMoveLeft: (index: number) => void;
  onMoveRight: (index: number) => void;
  onAddPhoto: () => void;
};

export default function SpotPhotoThumbnailStrip({
  items,
  activeIndex,
  disabled = false,
  onSelectIndex,
  onRemoveAt,
  onMoveLeft,
  onMoveRight,
  onAddPhoto,
}: SpotPhotoThumbnailStripProps) {
  const { t } = useI18n();
  const canAdd = items.length < SPOT_MAX_PHOTOS;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => {
          const isActive = index === activeIndex;

          return (
            <div key={item.id} className="relative shrink-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectIndex(index)}
                aria-label={t("spotEditor.photoOrder", { index: index + 1 })}
                aria-current={isActive ? "true" : undefined}
                className={`relative h-[4.25rem] w-[4.25rem] overflow-hidden rounded-xl ring-2 transition ${
                  isActive ? "ring-cyan-300" : "ring-white/15"
                } disabled:opacity-50`}
              >
                <img
                  src={item.previewUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                <span className="pointer-events-none absolute left-1 top-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {index + 1}
                </span>
              </button>

              {!disabled ? (
                <>
                  <button
                    type="button"
                    aria-label={t("spotEditor.removePhoto")}
                    onClick={() => onRemoveAt(index)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white ring-1 ring-white/20"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  </button>

                  {items.length > 1 ? (
                    <div className="mt-1 flex justify-center gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={t("spotEditor.movePhotoLeft")}
                        onClick={() => onMoveLeft(index)}
                        className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-white/80 disabled:opacity-30"
                      >
                        <ChevronLeft className="h-3 w-3" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={index === items.length - 1}
                        aria-label={t("spotEditor.movePhotoRight")}
                        onClick={() => onMoveRight(index)}
                        className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-white/80 disabled:opacity-30"
                      >
                        <ChevronRight className="h-3 w-3" aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}

        {canAdd ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onAddPhoto}
            aria-label={t("spotCompose.addPhoto")}
            className="flex h-[4.25rem] w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-white/[0.06] text-white ring-1 ring-white/15 transition hover:bg-white/10 disabled:opacity-50"
          >
            <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>

      {!canAdd ? (
        <p className="text-center text-[11px] text-white/45">{t("spotEditor.maxPhotos")}</p>
      ) : null}
    </div>
  );
}
