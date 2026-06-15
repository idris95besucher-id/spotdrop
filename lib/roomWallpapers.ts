export type RoomWallpaperLevel = "city" | "country" | "fallback";

export type RoomWallpaperTheme = {
  id: string;
  label: string;
  level: RoomWallpaperLevel;
  opacity: number;
  tileSize: number;
  stroke: string;
  motifs: RoomWallpaperMotifPlacement[];
};

export type RoomWallpaperMotifPlacement = {
  motif: RoomWallpaperMotifId;
  x: number;
  y: number;
  scale?: number;
  rotate?: number;
};

export type RoomWallpaperMotifId =
  | "bear"
  | "clockTower"
  | "alps"
  | "river"
  | "swissCross"
  | "violin"
  | "coffee"
  | "ferrisWheel"
  | "musicNote"
  | "palaceDome"
  | "compass"
  | "mapPin"
  | "chatBubble"
  | "star";

const MOTIF_VIEWBOX = 24;

const MOTIF_PATHS: Record<RoomWallpaperMotifId, string> = {
  bear: `<circle cx="7.5" cy="8" r="2.2"/><circle cx="16.5" cy="8" r="2.2"/><path d="M12 11c-3.2 0-5.5 1.8-5.5 4.2V18h11v-2.8C17.5 12.8 15.2 11 12 11z"/><path d="M9.5 9.5l-1.2-1.8M14.5 9.5l1.2-1.8"/>`,
  clockTower: `<path d="M8 20V9l4-3 4 3v11"/><path d="M10 20h4"/><circle cx="12" cy="12.5" r="2.3"/><path d="M12 12.5V10.8M12 12.5h1.5"/><path d="M11.2 4.5h1.6v1.3h-1.6z"/>`,
  alps: `<path d="M3 18 8.5 9l3.5 5.5L15 8l6 10"/><path d="M3 18h18"/>`,
  river: `<path d="M3 12c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 7.5 0"/><path d="M3 16c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 7.5 0"/>`,
  swissCross: `<rect x="5" y="5" width="14" height="14" rx="1.5"/><path d="M12 8v8M8 12h8"/>`,
  violin: `<path d="M9 5c0 2 1.5 3.5 3 3.5S15 7 15 5"/><path d="M12 8.5v9"/><ellipse cx="12" cy="18.5" rx="3.2" ry="2.2"/><path d="M10.5 11.5c1 .8 2 .8 3 0"/>`,
  coffee: `<path d="M7 9h8v7.5c0 1.4-1.1 2.5-2.5 2.5H9.5C8.1 19 7 17.9 7 16.5V9z"/><path d="M15 11h1.5a2 2 0 0 1 0 4H15"/><path d="M9 6.5V8M12 6V8M15 6.5V8"/>`,
  ferrisWheel: `<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.2"/><path d="M12 5v14M5 12h14M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4"/>`,
  musicNote: `<path d="M10 18a2 2 0 1 1-1-3.7V7.5l7-1.8v8.3a2 2 0 1 1-1-3.7"/>`,
  palaceDome: `<path d="M5 18V11l7-4 7 4v7"/><path d="M8 18h8"/><path d="M10.5 11.5c1.2.8 2.8.8 4 0"/><path d="M12 7v2"/>`,
  compass: `<circle cx="12" cy="12" r="7"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2"/><path d="m12 8 2.5 4.5L12 15l-2.5-2.5L12 8z"/>`,
  mapPin: `<path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10z"/><circle cx="12" cy="11" r="2.2"/>`,
  chatBubble: `<path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-3.5 3v-3H8.5A3.5 3.5 0 0 1 5 11.5v-5z"/>`,
  star: `<path d="M12 4.5 13.8 9l4.7.4-3.6 3 1.1 4.6L12 14.8 8 17l1.1-4.6-3.6-3 4.7-.4L12 4.5z"/>`,
};

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function tileMotifs(motifs: RoomWallpaperMotifPlacement[], offsetX: number, offsetY: number) {
  return motifs
    .map(({ motif, x, y, scale = 1, rotate = 0 }) => {
      const path = MOTIF_PATHS[motif];
      const transform = `translate(${offsetX + x} ${offsetY + y}) rotate(${rotate} ${MOTIF_VIEWBOX / 2} ${MOTIF_VIEWBOX / 2}) scale(${scale})`;

      return `<g transform="${transform}"><g transform="translate(${(MOTIF_VIEWBOX * (1 - scale)) / 2} ${(MOTIF_VIEWBOX * (1 - scale)) / 2})">${path}</g></g>`;
    })
    .join("");
}

function buildPatternSvg(theme: RoomWallpaperTheme) {
  const { tileSize, stroke, motifs } = theme;
  const half = tileSize / 2;

  const primary = tileMotifs(motifs, 0, 0);
  const shifted = tileMotifs(
    motifs.map((entry, index) => ({
      ...entry,
      x: entry.x + (index % 2 === 0 ? 10 : 6),
      y: entry.y + (index % 2 === 0 ? 8 : 12),
      rotate: (entry.rotate ?? 0) + (index % 2 === 0 ? 8 : -6),
      scale: (entry.scale ?? 1) * 0.92,
    })),
    half,
    half
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}" viewBox="0 0 ${tileSize} ${tileSize}">
    <g fill="none" stroke="${stroke}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">
      ${primary}
      ${shifted}
    </g>
  </svg>`;
}

function encodeSvgDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const BERN_WALLPAPER: RoomWallpaperTheme = {
  id: "bern",
  label: "Bern",
  level: "city",
  opacity: 0.08,
  tileSize: 152,
  stroke: "#e2e8f0",
  motifs: [
    { motif: "bear", x: 8, y: 10, scale: 0.82 },
    { motif: "clockTower", x: 92, y: 8, scale: 0.88 },
    { motif: "alps", x: 44, y: 34, scale: 0.9 },
    { motif: "river", x: 10, y: 88, scale: 0.86 },
    { motif: "swissCross", x: 98, y: 92, scale: 0.78 },
  ],
};

const VIENNA_WALLPAPER: RoomWallpaperTheme = {
  id: "vienna",
  label: "Vienna",
  level: "city",
  opacity: 0.08,
  tileSize: 152,
  stroke: "#e2e8f0",
  motifs: [
    { motif: "violin", x: 10, y: 12, scale: 0.84 },
    { motif: "coffee", x: 96, y: 10, scale: 0.86 },
    { motif: "ferrisWheel", x: 48, y: 36, scale: 0.72 },
    { motif: "musicNote", x: 12, y: 92, scale: 0.82 },
    { motif: "palaceDome", x: 92, y: 88, scale: 0.84 },
  ],
};

const SWITZERLAND_WALLPAPER: RoomWallpaperTheme = {
  id: "switzerland",
  label: "Switzerland",
  level: "country",
  opacity: 0.07,
  tileSize: 144,
  stroke: "#cbd5e1",
  motifs: [
    { motif: "swissCross", x: 12, y: 14, scale: 0.8 },
    { motif: "alps", x: 72, y: 18, scale: 0.86 },
    { motif: "river", x: 18, y: 78, scale: 0.8 },
    { motif: "star", x: 86, y: 82, scale: 0.72 },
  ],
};

const AUSTRIA_WALLPAPER: RoomWallpaperTheme = {
  id: "austria",
  label: "Austria",
  level: "country",
  opacity: 0.07,
  tileSize: 144,
  stroke: "#cbd5e1",
  motifs: [
    { motif: "musicNote", x: 14, y: 16, scale: 0.82 },
    { motif: "alps", x: 74, y: 12, scale: 0.84 },
    { motif: "palaceDome", x: 16, y: 78, scale: 0.8 },
    { motif: "violin", x: 84, y: 80, scale: 0.76 },
  ],
};

const FALLBACK_WALLPAPER: RoomWallpaperTheme = {
  id: "fallback",
  label: "SpotDrop",
  level: "fallback",
  opacity: 0.06,
  tileSize: 136,
  stroke: "#94a3b8",
  motifs: [
    { motif: "mapPin", x: 12, y: 14, scale: 0.78 },
    { motif: "compass", x: 72, y: 16, scale: 0.74 },
    { motif: "chatBubble", x: 18, y: 74, scale: 0.76 },
    { motif: "star", x: 78, y: 78, scale: 0.7 },
  ],
};

const CITY_WALLPAPERS: Record<string, RoomWallpaperTheme> = {
  bern: BERN_WALLPAPER,
  vienna: VIENNA_WALLPAPER,
};

const COUNTRY_WALLPAPERS: Record<string, RoomWallpaperTheme> = {
  switzerland: SWITZERLAND_WALLPAPER,
  austria: AUSTRIA_WALLPAPER,
};

const patternCache = new Map<string, string>();

function getPatternDataUrl(theme: RoomWallpaperTheme) {
  const cached = patternCache.get(theme.id);

  if (cached) {
    return cached;
  }

  const dataUrl = encodeSvgDataUrl(buildPatternSvg(theme));
  patternCache.set(theme.id, dataUrl);
  return dataUrl;
}

export function resolveRoomWallpaper(citySlug: string, countrySlug: string): RoomWallpaperTheme {
  const city = CITY_WALLPAPERS[normalizeSlug(citySlug)];

  if (city) {
    return city;
  }

  const country = COUNTRY_WALLPAPERS[normalizeSlug(countrySlug)];

  if (country) {
    return country;
  }

  return FALLBACK_WALLPAPER;
}

export function buildRoomWallpaperStyle(theme: RoomWallpaperTheme): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: "repeat";
  opacity: number;
} {
  return {
    backgroundImage: `url("${getPatternDataUrl(theme)}")`,
    backgroundSize: `${theme.tileSize}px ${theme.tileSize}px`,
    backgroundRepeat: "repeat",
    opacity: theme.opacity,
  };
}

export {
  AUSTRIA_WALLPAPER,
  BERN_WALLPAPER,
  FALLBACK_WALLPAPER,
  SWITZERLAND_WALLPAPER,
  VIENNA_WALLPAPER,
};
