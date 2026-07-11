"use client";

import type { ReactNode } from "react";

type LocationCardViewerFrameProps = {
  children: ReactNode;
};

/**
 * Frames a Text Card above the Spot viewer chrome so "Saved at" / location
 * stay fully visible and are never covered by profile or See Spot overlays.
 */
export default function LocationCardViewerFrame({ children }: LocationCardViewerFrameProps) {
  return (
    <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#050816] px-4 pb-[max(11.5rem,calc(env(safe-area-inset-bottom)+9.5rem))] pt-[max(3.5rem,env(safe-area-inset-top))]">
      <div
        data-spot-viewer-media
        className="relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-[1.25rem] shadow-2xl ring-1 ring-white/10"
      >
        {children}
      </div>
    </div>
  );
}
