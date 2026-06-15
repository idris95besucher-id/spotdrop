export const MAPBOX_DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

export const DEFAULT_MAP_CENTER: [number, number] = [7.4474, 46.948];

export const DEFAULT_MAP_ZOOM = 11;

export function getMapboxAccessToken() {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
}
