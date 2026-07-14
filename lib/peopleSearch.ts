import { excludeGuideProfiles, sanitizePublicProfiles } from "@/lib/publicProfile";
import { toUserFacingError } from "@/lib/userFacingError";
import { supabase } from "@/lib/supabaseClient";

/** Matches SpotDrop registration minimum (`isAtLeast13`). */
export const PEOPLE_SEARCH_MIN_AGE = 13;
export const PEOPLE_SEARCH_MAX_AGE = 99;

export type PeopleSearchProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  country_slug?: string | null;
  city_id?: string | null;
  /** Integer age only — never store or expose exact DOB. */
  age_years?: number | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

export type PeopleSearchCountry = {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
};

export type PeopleSearchCity = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

export type PeopleSearchCatalog = {
  countries: PeopleSearchCountry[];
  cities: PeopleSearchCity[];
  profiles: PeopleSearchProfile[];
};

const PROFILE_SELECT =
  "id, username, avatar_url, country_slug, city_id, age_years, is_online, last_seen_at";
const PROFILE_SELECT_LEGACY =
  "id, username, avatar_url, country_slug, city_id, date_of_birth, is_online, last_seen_at";
const PROFILE_SELECT_LEGACY_NO_LAST_SEEN =
  "id, username, avatar_url, country_slug, city_id, date_of_birth, is_online";

type RawProfileRow = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
  country_slug?: string | null;
  city_id?: string | null;
  age_years?: number | null;
  date_of_birth?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

function ageFromDateOfBirth(dateOfBirth: string | null | undefined) {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(dateOfBirth);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
}

/** Normalize API rows and strip exact DOB before anything reaches UI. */
export function normalizePeopleSearchProfile(row: RawProfileRow): PeopleSearchProfile {
  const ageYears =
    typeof row.age_years === "number" && Number.isFinite(row.age_years)
      ? row.age_years
      : ageFromDateOfBirth(row.date_of_birth);

  return {
    id: row.id,
    username: row.username ?? "",
    avatar_url: row.avatar_url ?? null,
    country_slug: row.country_slug ?? null,
    city_id: row.city_id ?? null,
    age_years: ageYears,
    is_online: row.is_online ?? null,
    last_seen_at: row.last_seen_at ?? null,
  };
}

let catalogCache: PeopleSearchCatalog | null = null;
let catalogPromise: Promise<{ catalog: PeopleSearchCatalog; error: string | null }> | null = null;

async function fetchProfiles(): Promise<{ data: RawProfileRow[]; error: { message?: string; code?: string } | null }> {
  const modern = await supabase.from("profiles").select(PROFILE_SELECT).order("username", { ascending: true });

  if (!modern.error) {
    return { data: (modern.data ?? []) as RawProfileRow[], error: null };
  }

  if (modern.error.code !== "42703") {
    return { data: [], error: modern.error };
  }

  const legacy = await supabase.from("profiles").select(PROFILE_SELECT_LEGACY).order("username", { ascending: true });

  if (!legacy.error) {
    return { data: (legacy.data ?? []) as RawProfileRow[], error: null };
  }

  if (legacy.error.code !== "42703") {
    return { data: [], error: legacy.error };
  }

  const oldest = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_LEGACY_NO_LAST_SEEN)
    .order("username", { ascending: true });

  return {
    data: (oldest.data ?? []) as RawProfileRow[],
    error: oldest.error,
  };
}

export async function loadPeopleSearchCatalog(options?: { force?: boolean }) {
  if (!options?.force && catalogCache) {
    return { catalog: catalogCache, error: null as string | null };
  }

  if (!options?.force && catalogPromise) {
    return catalogPromise;
  }

  catalogPromise = (async () => {
    const [countriesResult, citiesResult, profilesResult] = await Promise.all([
      supabase.from("countries").select("id, name, slug, emoji").order("name", { ascending: true }),
      supabase.from("cities").select("id, name, slug, country_id").order("name", { ascending: true }),
      fetchProfiles(),
    ]);

    let error: string | null = null;

    if (countriesResult.error) {
      error = toUserFacingError(countriesResult.error, "Unable to load countries.");
    } else if (citiesResult.error) {
      error = toUserFacingError(citiesResult.error, "Unable to load cities.");
    } else if (profilesResult.error) {
      error = toUserFacingError(profilesResult.error, "Unable to load users.");
    }

    const profiles = sanitizePublicProfiles(
      excludeGuideProfiles((profilesResult.data ?? []).map(normalizePeopleSearchProfile))
    );

    const catalog: PeopleSearchCatalog = {
      countries: (countriesResult.data ?? []) as PeopleSearchCountry[],
      cities: (citiesResult.data ?? []) as PeopleSearchCity[],
      profiles,
    };

    if (!error) {
      catalogCache = catalog;
    }

    return { catalog, error };
  })();

  try {
    return await catalogPromise;
  } finally {
    catalogPromise = null;
  }
}

export function filterPeopleByUsername(profiles: PeopleSearchProfile[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const exact: PeopleSearchProfile[] = [];
  const partial: PeopleSearchProfile[] = [];

  for (const profile of profiles) {
    const username = profile.username.toLowerCase();

    if (username === normalized) {
      exact.push(profile);
    } else if (username.includes(normalized)) {
      partial.push(profile);
    }
  }

  return [...exact, ...partial];
}

export function filterPeopleByAge(profiles: PeopleSearchProfile[], minAge: number, maxAge: number) {
  return profiles.filter((profile) => {
    const age = profile.age_years;

    if (typeof age !== "number" || !Number.isFinite(age)) {
      return false;
    }

    return age >= minAge && age <= maxAge;
  });
}

export function filterPeopleByFilters(
  profiles: PeopleSearchProfile[],
  options: {
    minAge: number;
    maxAge: number;
    countrySlug: string;
    cityId: string;
    onlineOnly: boolean;
    isOnline: (profile: PeopleSearchProfile) => boolean;
  }
) {
  return profiles.filter((profile) => {
    const age = profile.age_years;

    if (typeof age !== "number" || !Number.isFinite(age)) {
      return false;
    }

    if (age < options.minAge || age > options.maxAge) {
      return false;
    }

    if (options.countrySlug && profile.country_slug !== options.countrySlug) {
      return false;
    }

    if (options.cityId && profile.city_id !== options.cityId) {
      return false;
    }

    if (options.onlineOnly && !options.isOnline(profile)) {
      return false;
    }

    return true;
  });
}

/** @deprecated Prefer filterPeopleByFilters */
export function filterPeopleAdvanced(
  profiles: PeopleSearchProfile[],
  options: {
    countrySlug: string;
    cityId: string;
    onlineOnly: boolean;
    isOnline: (profile: PeopleSearchProfile) => boolean;
  }
) {
  return filterPeopleByFilters(profiles, {
    minAge: PEOPLE_SEARCH_MIN_AGE,
    maxAge: PEOPLE_SEARCH_MAX_AGE,
    ...options,
  });
}

export function parseAgeInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

export type PeopleSearchAgeValidationError =
  | "search.age.error.invalid"
  | "search.age.error.tooYoung"
  | "search.age.error.tooOld"
  | "search.age.error.minExceedsMax";

/** Returns a translation key when invalid, or null when the range is valid. */
export function validatePeopleSearchAgeRange(
  minRaw: string,
  maxRaw: string
): PeopleSearchAgeValidationError | null {
  const minAge = parseAgeInput(minRaw);
  const maxAge = parseAgeInput(maxRaw);

  if (minAge == null || maxAge == null) {
    return "search.age.error.invalid";
  }

  if (minAge < PEOPLE_SEARCH_MIN_AGE || maxAge < PEOPLE_SEARCH_MIN_AGE) {
    return "search.age.error.tooYoung";
  }

  if (minAge > PEOPLE_SEARCH_MAX_AGE || maxAge > PEOPLE_SEARCH_MAX_AGE) {
    return "search.age.error.tooOld";
  }

  if (minAge > maxAge) {
    return "search.age.error.minExceedsMax";
  }

  return null;
}
