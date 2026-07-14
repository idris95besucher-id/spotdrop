/**
 * SpotDrop chat wallpaper system — large seamless SVG doodle tiles.
 * Used only in city room chats and DM threads (not Map or other screens).
 * Assets live in public/wallpapers/ (regenerate via scripts/generate-chat-wallpapers.mjs).
 */

export type ChatWallpaperDensity = "visit" | "dm";

export type ChatWallpaperTheme = {
  id: string;
  density: ChatWallpaperDensity;
  /** Pattern image URL (public path). */
  src: string;
  /** CSS background-size — keep drawings large enough to read. */
  backgroundSize: string;
  /** Extra layer opacity (artwork already has stroke opacity baked in). */
  layerOpacity: number;
};

/** Visit rooms — rich SpotDrop travel/urban doodles. Tile 800×1000. */
export const VISIT_WALLPAPER: ChatWallpaperTheme = {
  id: "spotdrop-visit",
  density: "visit",
  src: "/wallpapers/spotdrop-visit.svg",
  backgroundSize: "800px 1000px",
  layerOpacity: 1,
};

/** DM — same language, calmer / more open space. Tile 800×1000. */
export const DM_WALLPAPER: ChatWallpaperTheme = {
  id: "spotdrop-dm",
  density: "dm",
  src: "/wallpapers/spotdrop-dm.svg",
  backgroundSize: "800px 1000px",
  layerOpacity: 1,
};

export function resolveVisitWallpaper(_citySlug?: string, _countrySlug?: string): ChatWallpaperTheme {
  return VISIT_WALLPAPER;
}

export function resolveDmWallpaper(): ChatWallpaperTheme {
  return DM_WALLPAPER;
}

export function buildChatWallpaperStyle(theme: ChatWallpaperTheme): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: "repeat";
  opacity: number;
} {
  return {
    backgroundImage: `url("${theme.src}")`,
    backgroundSize: theme.backgroundSize,
    backgroundRepeat: "repeat",
    opacity: theme.layerOpacity,
  };
}

/* Back-compat aliases */
export type RoomWallpaperTheme = ChatWallpaperTheme;

export function resolveRoomWallpaper(citySlug: string, countrySlug: string) {
  return resolveVisitWallpaper(citySlug, countrySlug);
}

export function buildRoomWallpaperStyle(theme: ChatWallpaperTheme) {
  return buildChatWallpaperStyle(theme);
}

export const BERN_WALLPAPER = VISIT_WALLPAPER;
export const VIENNA_WALLPAPER = VISIT_WALLPAPER;
export const SWITZERLAND_WALLPAPER = VISIT_WALLPAPER;
export const AUSTRIA_WALLPAPER = VISIT_WALLPAPER;
export const FALLBACK_WALLPAPER = VISIT_WALLPAPER;
