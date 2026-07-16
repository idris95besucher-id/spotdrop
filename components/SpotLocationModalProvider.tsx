"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import SpotLocationSheet from "@/components/SpotLocationSheet";
import type { SpotLocationDisplayFields } from "@/lib/spotLocationDisplay";
import type { SpotLocationViewerContext } from "@/lib/spotVisitContext";

type SpotLocationModalContextValue = {
  openSpotLocation: (spot: SpotLocationDisplayFields, viewerContext?: SpotLocationViewerContext) => void;
  closeSpotLocation: () => void;
};

const SpotLocationModalContext = createContext<SpotLocationModalContextValue | null>(null);

export function useSpotLocationModal() {
  const context = useContext(SpotLocationModalContext);

  if (!context) {
    throw new Error("useSpotLocationModal must be used within SpotLocationModalProvider");
  }

  return context;
}

export function useSpotLocationModalOptional() {
  return useContext(SpotLocationModalContext);
}

const DEFAULT_VIEWER_CONTEXT: SpotLocationViewerContext = {
  viewerId: null,
  ownerId: null,
  authResolved: true,
};

export default function SpotLocationModalProvider({ children }: { children: ReactNode }) {
  const [activeSpot, setActiveSpot] = useState<SpotLocationDisplayFields | null>(null);
  const [activeViewerContext, setActiveViewerContext] =
    useState<SpotLocationViewerContext>(DEFAULT_VIEWER_CONTEXT);

  const openSpotLocation = useCallback(
    (spot: SpotLocationDisplayFields, viewerContext: SpotLocationViewerContext = DEFAULT_VIEWER_CONTEXT) => {
      setActiveSpot({ ...spot });
      setActiveViewerContext(viewerContext);
    },
    []
  );

  const closeSpotLocation = useCallback(() => {
    setActiveSpot(null);
  }, []);

  const value = useMemo(
    () => ({
      openSpotLocation,
      closeSpotLocation,
    }),
    [closeSpotLocation, openSpotLocation]
  );

  return (
    <SpotLocationModalContext.Provider value={value}>
      {children}
      <SpotLocationSheet spot={activeSpot} viewerContext={activeViewerContext} onClose={closeSpotLocation} />
    </SpotLocationModalContext.Provider>
  );
}

