/** Slugs shown on /rooms/switzerland. Hidden cities remain in Supabase and direct URLs still work. */
export const SWITZERLAND_COUNTRY_SLUG = "switzerland";

/** Main cantons/regions plus important tourist cities. */
export const SWITZERLAND_FEATURED_CITY_SLUGS = new Set([
  // Cantons / regions
  "aargau",
  "appenzell",
  "basel",
  "bern",
  "fribourg",
  "geneva",
  "graubunden",
  "jura",
  "lucerne",
  "neuchatel",
  "schaffhausen",
  "schwyz",
  "st-gallen",
  "ticino",
  "thurgau",
  "valais",
  "vaud",
  "zug",
  "zurich",
  // Important tourist cities
  "chur",
  "davos",
  "grindelwald",
  "interlaken",
  "lausanne",
  "lugano",
  "montreux",
  "st-moritz",
  "thun",
  "zermatt",
]);

export function filterSwitzerlandRoomPickerCities<T extends { slug: string }>(cities: T[]): T[] {
  return cities.filter((city) => SWITZERLAND_FEATURED_CITY_SLUGS.has(city.slug));
}
