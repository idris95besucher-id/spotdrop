/** Slugs hidden on /rooms/russia. Data and direct URLs remain available. */
export const RUSSIA_COUNTRY_SLUG = "russia";

export const RUSSIA_HIDDEN_CITY_SLUGS = new Set(["grozny"]);

export function filterRussiaRoomPickerCities<T extends { slug: string }>(cities: T[]): T[] {
  return cities.filter((city) => !RUSSIA_HIDDEN_CITY_SLUGS.has(city.slug));
}
