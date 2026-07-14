"use client";

import { useMemo, type CSSProperties } from "react";
import {
  buildChatWallpaperStyle,
  type ChatWallpaperTheme,
} from "@/lib/roomWallpapers";

type ChatWallpaperLayerProps = {
  theme: ChatWallpaperTheme;
  className?: string;
  glow?: "chat" | "none";
  fillBackground?: boolean;
};

/**
 * Full-bleed SpotDrop doodle wallpaper for city rooms and DM threads only.
 */
export default function ChatWallpaperLayer({
  theme,
  className = "",
  glow = "chat",
  fillBackground = true,
}: ChatWallpaperLayerProps) {
  const patternStyle = useMemo((): CSSProperties => buildChatWallpaperStyle(theme), [theme]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()} aria-hidden>
      {fillBackground ? <div className="absolute inset-0 bg-[#060a12]" /> : null}

      {glow === "chat" ? (
        <>
          <div className="absolute -left-[18%] -top-[12%] h-[50%] w-[65%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.09)_0%,transparent_68%)]" />
          <div className="absolute -bottom-[16%] -right-[12%] h-[46%] w-[58%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(129,140,248,0.07)_0%,transparent_72%)]" />
        </>
      ) : null}

      <div className="absolute inset-0 [transform:translateZ(0)]" style={patternStyle} />

      {glow === "chat" ? (
        <div className="absolute inset-0 bg-gradient-to-b from-[#060a12]/15 via-transparent to-[#060a12]/22" />
      ) : null}
    </div>
  );
}
