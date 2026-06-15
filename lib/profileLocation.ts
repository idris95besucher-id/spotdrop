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
  emoji?: string | null;
};

type CityRow = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

export type ResolvedProfileLocation = {
  countryName: string | null;
  cityName: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function looksLikeRawId(value: string) {
  return /^\d+$/.test(value.trim());
}

function safeLocationName(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || looksLikeRawId(trimmed)) {
    return null;
  }

  return trimmed;
}

function isUnexpectedLocationError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code !== "PGRST116" &&
    !message.includes("json object requested, multiple") &&
    !message.includes("invalid input syntax for type uuid")
  );
}

export function formatProfileLocationLine(location: ResolvedProfileLocation) {
  const parts = [location.countryName, location.cityName].filter(
    (part): part is string => typeof part === "string" && part.length > 0
  );

  return parts.length > 0 ? parts.join(", ") : null;
}

async function loadCountryBySlug(slug: string): Promise<CountryRow | null> {
  const { data, error } = await supabase
    .from("countries")
    .select("id, name, slug, emoji")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  if (error && isUnexpectedLocationError(error)) {
    console.error("Profile country location error:", JSON.stringify(error, null, 2));
  }

  return (data as CountryRow | null) ?? null;
}

async function loadCountryById(countryId: string): Promise<CountryRow | null> {
  if (!isUuid(countryId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("countries")
    .select("id, name, slug, emoji")
    .eq("id", countryId)
    .maybeSingle();

  if (error && isUnexpectedLocationError(error)) {
    console.error("Profile country location error:", JSON.stringify(error, null, 2));
  }

  return (data as CountryRow | null) ?? null;
}

async function loadCityBySlug(slug: string): Promise<CityRow | null> {
  const { data, error } = await supabase
    .from("cities")
    .select("id, name, slug, country_id")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  if (error && isUnexpectedLocationError(error)) {
    console.error("Profile city location error:", JSON.stringify(error, null, 2));
  }

  return (data as CityRow | null) ?? null;
}

async function loadCityById(cityId: string): Promise<CityRow | null> {
  if (!isUuid(cityId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("cities")
    .select("id, name, slug, country_id")
    .eq("id", cityId)
    .maybeSingle();

  if (error && isUnexpectedLocationError(error)) {
    console.error("Profile city location error:", JSON.stringify(error, null, 2));
  }

  return (data as CityRow | null) ?? null;
}

export async function resolveProfileLocation(profile: ProfileLocationInput): Promise<ResolvedProfileLocation> {
  const empty = { countryName: null, cityName: null };

  try {
    const countrySlug = safeLocationName(profile.country_slug);
    const citySlug = safeLocationName(profile.city_slug);
    const cityIdRaw = profile.city_id?.trim() || null;
    const cityId = cityIdRaw && isUuid(cityIdRaw) ? cityIdRaw : null;

    if (!countrySlug && !citySlug && !cityId) {
      return empty;
    }

    let city: CityRow | null = null;

    if (citySlug) {
      city = await loadCityBySlug(citySlug);
    } else if (cityId) {
      city = await loadCityById(cityId);
    }

    let country: CountryRow | null = null;

    if (countrySlug) {
      country = await loadCountryBySlug(countrySlug);
    }

    if (!country && city?.country_id) {
      country = await loadCountryById(city.country_id);
    }

    return {
      countryName: safeLocationName(country?.name),
      cityName: safeLocationName(city?.name),
    };
  } catch {
    return empty;
  }
}
