"use client";

import { CheckCircle2 } from "lucide-react";
import type { MediaEditorItem } from "@/lib/mediaEditor";

type SpotOfflineDraftSavedScreenProps = {
  item: MediaEditorItem;
  onDone: () => void;
};

export default function SpotOfflineDraftSavedScreen({
  item,
  onDone,
}: SpotOfflineDraftSavedScreenProps) {
  return (
    <div className="fixed inset-0 z-[130] flex min-h-[100dvh] flex-col bg-background text-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CheckCircle2 className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </span>

        <h2 className="text-center text-xl font-semibold text-white">Saved as offline draft</h2>
        <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted">
          You can upload this Spot when you&apos;re back online.
        </p>

        <div className="mt-6 w-full max-w-xs overflow-hidden rounded-2xl bg-neutral-950">
          {item.mediaType === "video" ? (
            <video
              src={item.previewUrl}
              className="aspect-[4/5] w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewUrl} alt="" className="aspect-[4/5] w-full object-cover" />
          )}
        </div>

        <button
          type="button"
          onClick={onDone}
          className="mt-8 w-full max-w-xs rounded-xl bg-primary py-3.5 text-sm font-semibold text-background transition hover:brightness-110"
        >
          Done
        </button>
      </div>
    </div>
  );
}
