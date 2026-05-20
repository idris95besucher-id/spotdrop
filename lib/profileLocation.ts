"use client";

import { supabase } from "@/lib/supabaseClient";

type ProfileLocationInput = {
  country_slug?: string | null;
  city_id?: string | null;
  city_slug?: string | null;
};

type CountryRow = {
  id: string;
  name: string;
  slug: string;
  code?: string | null;
};

type CityRow = {
  id: string;
  name: string;
  slug?: string | null;
  country_id?: string | null;
};

export type ResolvedProfileLocation = {
  countryName: string | null;
  cityName: string | null;
};

export async function resolveProfileLocation(profile: ProfileLocationInput): Promise<ResolvedProfileLocation> {
  const countrySlug = profile.country_slug?.trim() || null;
  const cityId = profile.city_id?.trim() || null;
  const citySlug = profile.city_slug?.trim() || null;

  const [countryResult, cityResult] = await Promise.all([
    countrySlug
      ? supabase
          .from("countries")
          .select("id, name, slug, code")
          .or(`slug.eq.${countrySlug.toLowerCase()},code.eq.${countrySlug.toUpperCase()}`)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    cityId
      ? supabase.from("cities").select("id, name, slug, country_id").eq("id", cityId).maybeSingle()
      : citySlug
        ? supabase.from("cities").select("id, name, slug, country_id").eq("slug", citySlug).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
  ]);

  if (countryResult.error) {
    console.error("Profile country location error:", JSON.stringify(countryResult.error, null, 2));
  }

  if (cityResult.error) {
    console.error("Profile city location error:", JSON.stringify(cityResult.error, null, 2));
  }

  const country = countryResult.data as CountryRow | null;
  const city = cityResult.data as CityRow | null;

  if (country || !city?.country_id) {
    return {
      countryName: country?.name ?? null,
      cityName: city?.name ?? null,
    };
  }

  const { data: cityCountry, error: cityCountryError } = await supabase
    .from("countries")
    .select("id, name, slug, code")
    .eq("id", city.country_id)
    .maybeSingle();

  if (cityCountryError) {
    console.error("Profile city country location error:", JSON.stringify(cityCountryError, null, 2));
  }

  return {
    countryName: (cityCountry as CountryRow | null)?.name ?? null,
    cityName: city.name,
  };
}
