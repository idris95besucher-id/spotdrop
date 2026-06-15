"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import SpotLocationSheet from "@/components/SpotLocationSheet";
import type { SpotLocationDisplayFields } from "@/lib/spotLocationDisplay";

type SpotLocationModalContextValue = {
  openSpotLocation: (spot: SpotLocationDisplayFields) => void;
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

export default function SpotLocationModalProvider({ children }: { children: ReactNode }) {
  const [activeSpot, setActiveSpot] = useState<SpotLocationDisplayFields | null>(null);

  const openSpotLocation = useCallback((spot: SpotLocationDisplayFields) => {
    setActiveSpot({ ...spot });
  }, []);

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
      <SpotLocationSheet spot={activeSpot} onClose={closeSpotLocation} />
    </SpotLocationModalContext.Provider>
  );
}

