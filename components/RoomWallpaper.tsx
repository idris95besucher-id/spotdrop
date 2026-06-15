"use client";

import { useMemo } from "react";
import { buildRoomWallpaperStyle, resolveRoomWallpaper } from "@/lib/roomWallpapers";

type RoomWallpaperProps = {
  citySlug: string;
  countrySlug: string;
  className?: string;
};

export default function RoomWallpaper({ citySlug, countrySlug, className = "" }: RoomWallpaperProps) {
  const wallpaper = useMemo(() => resolveRoomWallpaper(citySlug, countrySlug), [citySlug, countrySlug]);
  const patternStyle = useMemo(() => buildRoomWallpaperStyle(wallpaper), [wallpaper]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()} aria-hidden>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.94)_0%,rgba(8,12,24,0.98)_100%)]" />
      <div className="absolute inset-0 [transform:translateZ(0)]" style={patternStyle} />
      <div className="absolute inset-0 bg-slate-950/20" />
    </div>
  );
}
