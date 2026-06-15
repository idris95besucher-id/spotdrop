import catalogData from "../scripts/city-attractions-data.json";
import type { CuratedTouristPlace, TouristPlaceCategory } from "@/lib/touristPlaceTypes";
import type { CityRoomPlaceSearchScope } from "@/lib/touristPlaceSearch";

type CatalogPlace = {
  rank: number;
  name: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  categories: string[];
};

type CatalogCity = {
  coords: {
    lat: number;
    lng: number;
    region: string;
    searchRadiusKm: number;
  };
  places: CatalogPlace[];
};

const catalog = catalogData as Record<string, Record<string, CatalogCity>>;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCountrySlug(countrySlug: string, countryName?: string | null) {
  const slug = countrySlug.trim().toLowerCase();

  if (slug === "ch" || slug === "schweiz" || slug === "suisse") {
    return "switzerland";
  }

  if (slug === "at" || slug === "oesterreich" || slug === "österreich") {
    return "austria";
  }

  if (slug === "de" || slug === "deutschland") {
    return "germany";
  }

  if (slug === "fr" || slug === "france") {
    return "france";
  }

  if (slug === "uk" || slug === "gb" || slug === "england") {
    return "united-kingdom";
  }

  const name = countryName?.trim().toLowerCase() ?? "";

  if (name === "switzerland" || name === "schweiz" || name === "suisse") {
    return "switzerland";
  }

  if (name === "austria" || name === "österreich" || name === "oesterreich") {
    return "austria";
  }

  if (name === "germany" || name === "deutschland") {
    return "germany";
  }

  if (name === "france") {
    return "france";
  }

  if (name === "united kingdom" || name === "uk") {
    return "united-kingdom";
  }

  return slug;
}

export function normalizeCitySlug(citySlug: string, cityName?: string | null) {
  const slug = citySlug.trim().toLowerCase();

  if (slug === "luzern" || slug === "luzern-city") {
    return "lucerne";
  }

  if (slug === "zuerich" || slug === "zürich") {
    return "zurich";
  }

  if (slug === "wien") {
    return "vienna";
  }

  if (slug === "luxembourg" || slug === "luxembourg-ville") {
    return "luxembourg-city";
  }

  const name = cityName?.trim().toLowerCase() ?? "";

  if (name === "luzern" || name === "lucerne") {
    return "lucerne";
  }

  if (name === "zürich" || name === "zurich") {
    return "zurich";
  }

  if (name === "wien" || name === "vienna") {
    return "vienna";
  }

  if (name === "luxembourg") {
    return "luxembourg-city";
  }

  return slug;
}

function getCatalogCity(countrySlug: string, citySlug: string) {
  return catalog[countrySlug]?.[citySlug] ?? null;
}

function catalogPlaceToCurated(
  place: CatalogPlace,
  input: {
    countrySlug: string;
    citySlug: string;
    cityName: string;
    countryName: string;
    region: string | null;
  }
): CuratedTouristPlace {
  const id = `${input.countrySlug}-${input.citySlug}-${slugify(place.name)}`;

  return {
    id,
    rank: place.rank,
    name: place.name,
    address: place.address,
    description: place.description,
    latitude: place.lat,
    longitude: place.lng,
    city: input.cityName,
    region: input.region,
    country: input.countryName,
    categories: place.categories as TouristPlaceCategory[],
    keywords: place.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  };
}

export function getCatalogScopeSeed(input: {
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
}): Omit<CityRoomPlaceSearchScope, "countryName" | "cityName"> | null {
  const countrySlug = normalizeCountrySlug(input.countrySlug, input.countryName);
  const citySlug = normalizeCitySlug(input.citySlug, input.cityName);
  const entry = getCatalogCity(countrySlug, citySlug);

  if (!entry) {
    return null;
  }

  return {
    countrySlug,
    citySlug,
    region: input.region ?? entry.coords.region ?? null,
    latitude: entry.coords.lat,
    longitude: entry.coords.lng,
    searchRadiusKm: entry.coords.searchRadiusKm,
  };
}

export function getCuratedPlacesFromCatalog(input: {
  countrySlug: string;
  countryName: string;
  citySlug: string;
  cityName: string;
  region?: string | null;
}): CuratedTouristPlace[] {
  const countrySlug = normalizeCountrySlug(input.countrySlug, input.countryName);
  const citySlug = normalizeCitySlug(input.citySlug, input.cityName);
  const entry = getCatalogCity(countrySlug, citySlug);

  if (!entry) {
    return [];
  }

  return entry.places
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((place) =>
      catalogPlaceToCurated(place, {
        countrySlug,
        citySlug,
        cityName: input.cityName,
        countryName: input.countryName,
        region: input.region ?? entry.coords.region ?? null,
      })
    );
}

export function getCountryFallbackPlacesFromCatalog(input: {
  countrySlug: string;
  countryName: string;
  limit: number;
}): CuratedTouristPlace[] {
  const countrySlug = normalizeCountrySlug(input.countrySlug, input.countryName);
  const countryCities = catalog[countrySlug];

  if (!countryCities) {
    return [];
  }

  const picks: CuratedTouristPlace[] = [];

  for (const [citySlug, cityEntry] of Object.entries(countryCities)) {
    const topPlace = cityEntry.places.slice().sort((left, right) => left.rank - right.rank)[0];

    if (!topPlace) {
      continue;
    }

    picks.push(
      catalogPlaceToCurated(topPlace, {
        countrySlug,
        citySlug,
        cityName: cityEntry.coords.region || citySlug.replace(/-/g, " "),
        countryName: input.countryName,
        region: cityEntry.coords.region ?? null,
      })
    );
  }

  return picks
    .slice()
    .sort((left, right) => (left.rank ?? 99) - (right.rank ?? 99))
    .slice(0, input.limit);
}

export function hasCatalogPlacesForCity(countrySlug: string, citySlug: string, cityName?: string | null) {
  const normalizedCountry = normalizeCountrySlug(countrySlug);
  const normalizedCity = normalizeCitySlug(citySlug, cityName);
  return Boolean(getCatalogCity(normalizedCountry, normalizedCity));
}

export { catalog as cityAttractionsCatalog };
