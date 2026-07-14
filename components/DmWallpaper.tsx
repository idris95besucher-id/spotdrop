"use client";

import { useMemo } from "react";
import ChatWallpaperLayer from "@/components/ChatWallpaperLayer";
import { resolveDmWallpaper } from "@/lib/roomWallpapers";

type DmWallpaperProps = {
  className?: string;
};

/** DM — calmer SpotDrop pattern with more empty space. */
export default function DmWallpaper({ className = "" }: DmWallpaperProps) {
  const theme = useMemo(() => resolveDmWallpaper(), []);

  return <ChatWallpaperLayer theme={theme} className={className} glow="chat" />;
}
