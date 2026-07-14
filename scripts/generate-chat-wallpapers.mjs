#!/usr/bin/env node
/**
 * Generates seamless SpotDrop chat wallpaper SVG tiles into public/wallpapers/.
 * Run: node scripts/generate-chat-wallpapers.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "wallpapers");

const VB = 24;

/** 24×24 outline doodles — SpotDrop travel / urban language */
const PATHS = {
  pin: `<path d="M12 21s5.4-4.7 5.4-9.1a5.4 5.4 0 1 0-10.8 0C6.6 16.3 12 21 12 21z"/><circle cx="12" cy="11.6" r="1.9"/>`,
  mapFold: `<path d="M4 7.5 9 5.5l6 2 5-2v11l-5 2-6-2-5 2z"/><path d="M9 5.5v11M15 7.5v11"/>`,
  globe: `<circle cx="12" cy="12" r="7"/><path d="M5 12h14M12 5c2.2 2.2 2.2 11.6 0 14M12 5c-2.2 2.2-2.2 11.6 0 14"/>`,
  compass: `<circle cx="12" cy="12" r="7"/><path d="M12 5v1.5M12 17.5V19M5 12h1.5M17.5 12H19"/><path d="m12 7.8 2.1 4L12 14.5l-2.1-2.7L12 7.8z"/>`,
  satellite: `<rect x="9.5" y="9.5" width="5" height="5" rx="0.8" transform="rotate(45 12 12)"/><path d="M7 7l2.2 2.2M17 17l-2.2-2.2M17 7l-2.2 2.2M7 17l2.2-2.2"/>`,
  trafficLight: `<rect x="9.2" y="3.2" width="5.6" height="14.5" rx="1.8"/><circle cx="12" cy="6.8" r="1.15"/><circle cx="12" cy="10.5" r="1.15"/><circle cx="12" cy="14.2" r="1.15"/>`,
  car: `<path d="M5 14.5h14l-1.2-3.2c-.3-.8-1-1.3-1.9-1.3H8.1c-.9 0-1.6.5-1.9 1.3L5 14.5z"/><path d="M6.5 14.5v2.2h2.2V14.5M15.3 14.5v2.2h2.2V14.5"/><circle cx="8.2" cy="16.8" r="1.1"/><circle cx="15.8" cy="16.8" r="1.1"/>`,
  bus: `<rect x="6" y="4.5" width="12" height="13" rx="2"/><path d="M6 10h12M9 17.5v2M15 17.5v2"/><circle cx="9" cy="13.2" r="0.9"/><circle cx="15" cy="13.2" r="0.9"/>`,
  tram: `<rect x="5.5" y="6" width="13" height="10" rx="1.5"/><path d="M8 6V4.5h8V6M5.5 11h13M8 16v2M16 16v2"/><circle cx="9" cy="13.2" r="0.85"/><circle cx="15" cy="13.2" r="0.85"/>`,
  train: `<rect x="6.5" y="5" width="11" height="10" rx="1.8"/><path d="M6.5 11h11M9 15.5 7.5 19M15 15.5 16.5 19"/><circle cx="9.5" cy="13" r="0.9"/><circle cx="14.5" cy="13" r="0.9"/>`,
  bike: `<circle cx="7" cy="15.5" r="2.6"/><circle cx="17" cy="15.5" r="2.6"/><path d="M7 15.5h4.2l2.3-5.2h2.3M11.2 15.5 13.5 10.3M10.5 10.3h5"/>`,
  plane: `<path d="M4 13.5 12 11l8 2.5-2.2.6L12 13l-5.2 1.2z"/><path d="M12 11V6.5L14.2 8M12 11v5.2"/>`,
  helicopter: `<path d="M6 12h10l1.5 4H7.5z"/><path d="M4 10.5h16M11.5 12V8h5"/><circle cx="9" cy="16.5" r="1"/>`,
  road: `<path d="M8 4v16M16 4v16"/><path d="M11.2 6.5h1.6M11.2 12h1.6M11.2 17.5h1.6"/>`,
  intersection: `<path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="2"/>`,
  roadSign: `<path d="M12 4v16"/><rect x="7" y="5.5" width="10" height="7" rx="1"/>`,
  tunnel: `<path d="M5 18V11a7 7 0 0 1 14 0v7"/><path d="M5 18h14"/>`,
  bridge: `<path d="M3 13.5h18"/><path d="M5 13.5c2.2-3.6 4.2-3.6 7 0s4.8 3.6 7 0"/><path d="M6.5 13.5v4M12 13.5v4M17.5 13.5v4"/>`,
  skyline: `<path d="M3 18V11.2h2.8V18M7 18V8h3.6v10M11.8 18v-5.5h2.8V18M15.8 18V9.2h5V18"/><path d="M3 18h18"/>`,
  skyscraper: `<rect x="8" y="3.5" width="8" height="16.5" rx="0.8"/><path d="M10 6.5h1.3M12.7 6.5H14M10 9.5h1.3M12.7 9.5H14M10 12.5h1.3M12.7 12.5H14M10 15.5h1.3M12.7 15.5H14"/>`,
  house: `<path d="M4 12 12 5l8 7"/><path d="M7 11.5V19h10v-7.5"/><path d="M10.5 19v-4h3v4"/>`,
  lamp: `<path d="M12 21v-7"/><path d="M8.5 9.5 12 5l3.5 4.5z"/><path d="M9 14h6"/>`,
  mountain: `<path d="M2.5 18 8.2 8.5l3.1 4.8L14.8 7.2 21.5 18"/><path d="M2.5 18h19"/>`,
  lake: `<ellipse cx="12" cy="14" rx="7.5" ry="3.2"/><path d="M7 12.5c1.5-3 4-4.5 5-4.5s3.5 1.5 5 4.5"/>`,
  river: `<path d="M3 10.5c2.8-1.8 5-1.8 7.4 0s4.8 1.8 7.2 0 4.6-1.8 6.4 0"/><path d="M3 14.5c2.8-1.8 5-1.8 7.4 0s4.8 1.8 7.2 0 4.6-1.8 6.4 0"/>`,
  beach: `<path d="M4 16c3.5-4 8-4 12 0"/><path d="M16.5 8.5c1.2 1.5 1.5 3.2.8 4.5"/><circle cx="17.2" cy="7.2" r="1.3"/>`,
  island: `<ellipse cx="12" cy="15.5" rx="7" ry="2.4"/><path d="M12 15.2V9.5M10 11.5c1.2-1.5 2.8-1.5 4 0"/>`,
  forest: `<path d="M7 18V12l-2.5 0L7 7.5 9.5 12H7z"/><path d="M14.5 18V11l-2.8 0L14.5 5.5 17.3 11H14.5z"/>`,
  boot: `<path d="M8 7h5.5v7.5H16l2 3.5H7.5z"/><path d="M8 14.5h5.5"/>`,
  footprints: `<ellipse cx="9" cy="9" rx="1.6" ry="2.2" transform="rotate(-18 9 9)"/><ellipse cx="14.5" cy="14.5" rx="1.6" ry="2.2" transform="rotate(12 14.5 14.5)"/>`,
  camera: `<rect x="4.5" y="8.2" width="15" height="9.5" rx="2"/><circle cx="12" cy="13" r="2.6"/><path d="M9 8.2 10.2 6.5h3.6L15 8.2"/>`,
  binoculars: `<circle cx="8.2" cy="12" r="3.2"/><circle cx="15.8" cy="12" r="3.2"/><path d="M10.5 10.5h3"/>`,
  backpack: `<path d="M8 9.5h8v9.5H8z"/><path d="M9.5 9.5V7.5c0-1.2 1-2 2.5-2s2.5.8 2.5 2v2"/><path d="M8 13h8"/>`,
  suitcase: `<rect x="5.5" y="9" width="13" height="9.5" rx="1.5"/><path d="M9 9V7.2c0-.7.6-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V9M12 12.5v3"/>`,
  hotel: `<rect x="5" y="7" width="14" height="12" rx="1.2"/><path d="M5 11h14M8 14.2h2M14 14.2h2M12 7V4.8"/>`,
  restaurant: `<path d="M8 5v6c0 1.5 1.2 2.2 2.2 2.2V19"/><path d="M8 7.5h2.2M15.5 5c0 2.5-1.5 3.5-1.5 5.5V19"/>`,
  coffee: `<path d="M7 9h8v6.8c0 1.3-1 2.3-2.3 2.3H9.3C8 18.1 7 17.1 7 15.8V9z"/><path d="M15 11h1.4a1.8 1.8 0 0 1 0 3.6H15"/><path d="M9.2 6.5V8M12 6V8M14.8 6.5V8"/>`,
  viewpoint: `<circle cx="12" cy="12" r="3"/><path d="M3.5 12h3.2M17.3 12h3.2M12 3.5v3.2M12 17.3v3.2"/>`,
  routeArrow: `<path d="M5 16c2.8-5 5-5 7-1.5s3.5 4.2 6.5.8"/><path d="m16.5 12.5 3.2 2.8-3.6.6"/>`,
  navCursor: `<path d="m12 4.5 6.5 15.2-6.5-3.2-6.5 3.2z"/>`,
  chat: `<path d="M5.2 6.8A3.2 3.2 0 0 1 8.4 3.5h7.2A3.2 3.2 0 0 1 18.8 6.8v4.5a3.2 3.2 0 0 1-3.2 3.2h-3.6L8.5 18v-3.5H8.4A3.2 3.2 0 0 1 5.2 11.3V6.8z"/>`,
  warning: `<path d="M12 4.5 20.5 19H3.5z"/><path d="M12 10v4.2M12 16.5h.01"/>`,
  parking: `<rect x="5.5" y="4.5" width="13" height="15" rx="1.5"/><path d="M9.5 8h3.2c1.5 0 2.5 1 2.5 2.4S14.2 12.8 12.7 12.8H9.5V8zM9.5 12.8V16"/>`,
  barrier: `<path d="M4 10h16M4 14h16"/><path d="M6 8v8M10 8v8M14 8v8M18 8v8"/>`,
  spotdrop: `<circle cx="12" cy="12" r="7.2"/><path d="M12 6.8v6.2"/><circle cx="12" cy="15.8" r="1.3"/>`,
  gps: `<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2"/><path d="M12 3.8v1.8M12 18.4v1.8M3.8 12h1.8M18.4 12h1.8"/>`,
  coords: `<path d="M4.5 8h6.5M4.5 12h9.5M4.5 16h7.5"/>`,
  grid: `<path d="M5.5 5.5h13v13h-13z"/><path d="M5.5 12h13M12 5.5v13"/>`,
};

const COLORS = {
  cyan: "#5eead4",
  blue: "#7dd3fc",
  violet: "#a5b4fc",
  amber: "#fbbf24",
  red: "#f87171",
};

const COLOR_BY_KIND = {
  trafficLight: "amber",
  warning: "red",
  barrier: "red",
  roadSign: "amber",
  parking: "blue",
  pin: "cyan",
  spotdrop: "cyan",
  chat: "violet",
  navCursor: "cyan",
  routeArrow: "blue",
  compass: "violet",
  globe: "blue",
  satellite: "violet",
  gps: "cyan",
};

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickColor(kind, rand) {
  const forced = COLOR_BY_KIND[kind];
  if (forced) return COLORS[forced];
  const roll = rand();
  if (roll < 0.42) return COLORS.cyan;
  if (roll < 0.78) return COLORS.blue;
  return COLORS.violet;
}

function placeDoodles({ pool, count, width, height, seed, minSize, maxSize, minGap, opacityMin, opacityMax }) {
  const rand = mulberry32(seed);
  const placed = [];
  let attempts = 0;

  while (placed.length < count && attempts < count * 60) {
    attempts += 1;
    const kind = pool[Math.floor(rand() * pool.length)];
    const size = minSize + rand() * (maxSize - minSize);
    const x = 24 + rand() * (width - size - 48);
    const y = 28 + rand() * (height - size - 56);
    const cx = x + size / 2;
    const cy = y + size / 2;

    const tooClose = placed.some((other) => {
      const dist = Math.hypot(cx - (other.x + other.size / 2), cy - (other.y + other.size / 2));
      return dist < Math.max(minGap, (size + other.size) * 0.42);
    });

    if (tooClose) continue;

    placed.push({
      kind,
      x,
      y,
      size,
      rotate: rand() * 50 - 25,
      opacity: opacityMin + rand() * (opacityMax - opacityMin),
      color: pickColor(kind, rand),
    });
  }

  return placed;
}

function doodleMarkup(d) {
  const path = PATHS[d.kind];
  if (!path) return "";
  const scale = d.size / VB;
  const transform = `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) rotate(${d.rotate.toFixed(1)} ${(d.size / 2).toFixed(1)} ${(d.size / 2).toFixed(1)}) scale(${scale.toFixed(4)})`;
  // stroke-width in 24-unit space; scales with icon so lines stay bold at 55–100px
  return `<g transform="${transform}" opacity="${d.opacity.toFixed(3)}" stroke="${d.color}" fill="none" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${path}</g>`;
}

function softCurves(width, height, seed) {
  const rand = mulberry32(seed ^ 0xabc);
  const parts = [];
  for (let i = 0; i < 4; i += 1) {
    const y = height * (0.18 + i * 0.2);
    const opacity = 0.06 + rand() * 0.05;
    parts.push(
      `<path d="M-40 ${y.toFixed(0)} C ${width * 0.25} ${(y - 40).toFixed(0)}, ${width * 0.55} ${(y + 50).toFixed(0)}, ${width + 40} ${(y - 10).toFixed(0)}" fill="none" stroke="#7dd3fc" stroke-width="1.2" opacity="${opacity.toFixed(3)}"/>`
    );
  }
  return parts.join("\n");
}

function buildSvg({ id, width, height, doodles, seed }) {
  const body = doodles.map(doodleMarkup).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="SpotDrop ${id} wallpaper">
  <title>SpotDrop ${id} chat wallpaper</title>
  <rect width="100%" height="100%" fill="transparent"/>
  ${softCurves(width, height, seed)}
  ${body}
</svg>
`;
}

const VISIT_POOL = Object.keys(PATHS);
const DM_POOL = [
  "pin",
  "mapFold",
  "globe",
  "compass",
  "gps",
  "routeArrow",
  "navCursor",
  "chat",
  "spotdrop",
  "skyline",
  "bridge",
  "camera",
  "suitcase",
  "viewpoint",
  "grid",
  "coords",
  "mountain",
  "plane",
  "car",
  "coffee",
  "hotel",
  "binoculars",
];

const TILE_W = 800;
const TILE_H = 1000;

const visitRand = mulberry32(0x51a7c3d);
const visitDoodles = placeDoodles({
  pool: VISIT_POOL,
  count: 52,
  width: TILE_W,
  height: TILE_H,
  seed: 0x51a7c3d,
  minSize: 52,
  maxSize: 110,
  minGap: 52,
  opacityMin: 0.14,
  opacityMax: 0.22,
});

// Prefer mid-large readable icons (Telegram-like presence)
for (const d of visitDoodles) {
  if (d.size < 58) d.size = 58 + (d.size % 12);
  if (d.size > 96 && visitRand() > 0.35) d.size = 72 + (d.size % 16);
}

// Secondary faint accents (7–10%) — fills gaps without competing with heroes
const visitSecondary = placeDoodles({
  pool: ["gps", "coords", "grid", "routeArrow", "lamp", "footprints", "intersection"],
  count: 8,
  width: TILE_W,
  height: TILE_H,
  seed: 0x9e3779b9,
  minSize: 38,
  maxSize: 52,
  minGap: 44,
  opacityMin: 0.07,
  opacityMax: 0.1,
}).filter((d) =>
  visitDoodles.every((other) => {
    const dist = Math.hypot(d.x + d.size / 2 - (other.x + other.size / 2), d.y + d.size / 2 - (other.y + other.size / 2));
    return dist > 48;
  })
);

const visitAll = [...visitSecondary, ...visitDoodles];

const dmDoodles = placeDoodles({
  pool: DM_POOL,
  count: 34,
  width: TILE_W,
  height: TILE_H,
  seed: 0x2d91e81,
  minSize: 48,
  maxSize: 96,
  minGap: 68,
  opacityMin: 0.1,
  opacityMax: 0.17,
});

for (const d of dmDoodles) {
  if (d.size < 55) d.size = 55 + (d.size % 10);
}

const dmSecondary = placeDoodles({
  pool: ["gps", "coords", "grid", "chat", "spotdrop"],
  count: 5,
  width: TILE_W,
  height: TILE_H,
  seed: 0x85ebca6b,
  minSize: 38,
  maxSize: 48,
  minGap: 56,
  opacityMin: 0.07,
  opacityMax: 0.1,
}).filter((d) =>
  dmDoodles.every((other) => {
    const dist = Math.hypot(d.x + d.size / 2 - (other.x + other.size / 2), d.y + d.size / 2 - (other.y + other.size / 2));
    return dist > 56;
  })
);

const dmAll = [...dmSecondary, ...dmDoodles];

fs.mkdirSync(outDir, { recursive: true });

const visitSvg = buildSvg({ id: "visit", width: TILE_W, height: TILE_H, doodles: visitAll, seed: 11 });
const dmSvg = buildSvg({ id: "dm", width: TILE_W, height: TILE_H, doodles: dmAll, seed: 22 });

fs.writeFileSync(path.join(outDir, "spotdrop-visit.svg"), visitSvg);
fs.writeFileSync(path.join(outDir, "spotdrop-dm.svg"), dmSvg);

const meta = {
  tileWidth: TILE_W,
  tileHeight: TILE_H,
  visit: {
    doodles: visitAll.length,
    mainOpacity: "14–22%",
    secondaryOpacity: "7–10%",
    sizePx: "38–110 (main mostly 58–96)",
  },
  dm: {
    doodles: dmAll.length,
    mainOpacity: "10–17%",
    secondaryOpacity: "7–10%",
    sizePx: "38–96 (main mostly 55–85)",
  },
  files: ["public/wallpapers/spotdrop-visit.svg", "public/wallpapers/spotdrop-dm.svg"],
};

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(meta, null, 2) + "\n");

console.log("Wrote wallpapers:");
console.log(`  visit: ${visitAll.length} doodles (${visitDoodles.length} main + ${visitSecondary.length} secondary)`);
console.log(`  dm:    ${dmAll.length} doodles (${dmDoodles.length} main + ${dmSecondary.length} secondary)`);
console.log(meta);
