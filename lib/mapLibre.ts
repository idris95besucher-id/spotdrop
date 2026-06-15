export const DEFAULT_MAP_CENTER: [number, number] = [7.4474, 46.948];

export const DEFAULT_MAP_ZOOM = 12;

const CARTO_DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function getMapTilerApiKey() {
  return process.env.NEXT_PUBLIC_MAPTILER_API_KEY?.trim() ?? "";
}

/** Dark vector basemap — MapTiler when configured, otherwise free Carto Dark Matter (OSM data). */
export function getMapLibreStyleUrl() {
  const key = getMapTilerApiKey();

  if (key) {
    return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${encodeURIComponent(key)}`;
  }

  return CARTO_DARK_STYLE;
}
