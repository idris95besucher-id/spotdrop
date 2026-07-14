"use client";

import { useMemo } from "react";
import ChatWallpaperLayer from "@/components/ChatWallpaperLayer";
import { resolveVisitWallpaper } from "@/lib/roomWallpapers";

type RoomWallpaperProps = {
  citySlug: string;
  countrySlug: string;
  className?: string;
};

/** Visit city/channel room — rich SpotDrop travel pattern. */
export default function RoomWallpaper({ citySlug, countrySlug, className = "" }: RoomWallpaperProps) {
  const theme = useMemo(() => resolveVisitWallpaper(citySlug, countrySlug), [citySlug, countrySlug]);

  return <ChatWallpaperLayer theme={theme} className={className} glow="chat" />;
}
