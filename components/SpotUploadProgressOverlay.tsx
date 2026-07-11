"use client";

import { Loader2 } from "lucide-react";
import { spotUploadDisplayPercent } from "@/lib/spotUploadPipeline";
import type { SpotUploadProgress } from "@/lib/spotUploadPipeline";

type SpotUploadProgressOverlayProps = {
  visible: boolean;
  progress: SpotUploadProgress | null;
  showDetailed?: boolean;
};

export default function SpotUploadProgressOverlay({
  visible,
  progress,
  showDetailed = false,
}: SpotUploadProgressOverlayProps) {
  if (!visible) {
    return null;
  }

  const rawPercent = progress?.percent ?? 0;
  const barPercent = spotUploadDisplayPercent(rawPercent);
  const label = progress?.label ?? (showDetailed ? "Preparing..." : "Publishing spot…");
  const showBar = showDetailed;
  const isComplete = rawPercent >= 100;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black px-8">
      <Loader2 className="h-10 w-10 animate-spin text-white" aria-hidden />
      <div className="w-full max-w-xs space-y-3 text-center">
        <p className="text-sm font-semibold text-white">{label}</p>
        {showBar ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${isComplete ? 100 : Math.max(barPercent > 0 ? 8 : 0, barPercent)}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
