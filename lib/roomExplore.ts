import {
  filterRussiaRoomPickerCities,
  RUSSIA_COUNTRY_SLUG,
} from "@/lib/russiaRoomPicker";
import {
  filterSwitzerlandRoomPickerCities,
  SWITZERLAND_COUNTRY_SLUG,
} from "@/lib/switzerlandRoomPicker";
import { supabase } from "@/lib/supabaseClient";

export type RoomCountry = {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
};

export type RoomCity = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

export const ROOM_COUNTRY_SELECT = "id, name, slug, emoji";
export const ROOM_CITY_SELECT = "id, name, slug, country_id";

export async function fetchRoomCountries() {
  const { data, error } = await supabase
    .from("countries")
    .select(ROOM_COUNTRY_SELECT)
    .order("name", { ascending: true });

  if (error) {
    return { countries: [] as RoomCountry[], error: error.message };
  }

  return { countries: (data ?? []) as RoomCountry[], error: null as string | null };
}

export async function fetchRoomCatalog() {
  const [countriesResult, citiesResult] = await Promise.all([
    supabase.from("countries").select(ROOM_COUNTRY_SELECT).order("name", { ascending: true }),
    supabase.from("cities").select(ROOM_CITY_SELECT).order("name", { ascending: true }),
  ]);

  if (countriesResult.error) {
    return {
      countries: [] as RoomCountry[],
      cities: [] as RoomCity[],
      error: countriesResult.error.message,
    };
  }

  if (citiesResult.error) {
    return {
      countries: (countriesResult.data ?? []) as RoomCountry[],
      cities: [] as RoomCity[],
      error: citiesResult.error.message,
    };
  }

  return {
    countries: (countriesResult.data ?? []) as RoomCountry[],
    cities: (citiesResult.data ?? []) as RoomCity[],
    error: null as string | null,
  };
}

export function sortCitiesForCountry(
  country: Pick<RoomCountry, "id" | "slug">,
  cities: RoomCity[]
) {
  const countryCities = cities
    .filter((city) => city.country_id === country.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (country.slug === SWITZERLAND_COUNTRY_SLUG) {
    return filterSwitzerlandRoomPickerCities(countryCities);
  }

  if (country.slug === RUSSIA_COUNTRY_SLUG) {
    return filterRussiaRoomPickerCities(countryCities);
  }

  return countryCities;
}

export async function resolveCityRoomId(countrySlug: string, citySlug: string) {
  const { data: country, error: countryError } = await supabase
    .from("countries")
    .select("id")
    .eq("slug", countrySlug)
    .maybeSingle();

  if (countryError || !country?.id) {
    return { cityId: null, error: countryError?.message ?? "Country room not found." };
  }

  const { data: city, error: cityError } = await supabase
    .from("cities")
    .select("id")
    .eq("country_id", country.id)
    .eq("slug", citySlug)
    .maybeSingle();

  if (cityError || !city?.id) {
    return { cityId: null, error: cityError?.message ?? "City room not found." };
  }

  return { cityId: city.id as string, error: null };
}
