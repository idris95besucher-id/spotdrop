"use client";

import { MessageCircle, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { MapMark } from "@/lib/mapMarks";
import { mapMarkAvatarInitial } from "@/lib/mapMarkMarkers";

type MapMarkClusterSheetProps = {
  marks: MapMark[];
  embedded?: boolean;
  onSelect: (mark: MapMark) => void;
  onClose: () => void;
};

export default function MapMarkClusterSheet({
  marks,
  embedded = false,
  onSelect,
  onClose,
}: MapMarkClusterSheetProps) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-mark-cluster-title"
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl shadow-black/50"
        style={{
          maxHeight: "min(70dvh, 28rem)",
          paddingBottom: embedded
            ? "max(1rem, calc(env(safe-area-inset-bottom) + 54px))"
            : "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex shrink-0 justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 id="map-mark-cluster-title" className="text-[15px] font-semibold text-white">
            {t("map.markClusterTitle", { count: marks.length })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-4 py-3">
          {marks.map((mark) => (
            <li key={mark.id}>
              <button
                type="button"
                onClick={() => onSelect(mark)}
                className="flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/[0.07]"
              >
                <span className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-cyan-400/85 bg-slate-800 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
                  {mark.avatar_url ? (
                    <img src={mark.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-white">{mapMarkAvatarInitial(mark.username)}</span>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[#0B1026] bg-cyan-500 text-white">
                    <MessageCircle className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">@{mark.username}</span>
                  <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-300">{mark.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="shrink-0 border-t border-white/10 px-4 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
