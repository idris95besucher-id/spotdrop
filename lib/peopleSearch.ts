import { isGuideAccountUsername } from "@/lib/guideAccounts";
import { excludeGuideProfiles, sanitizePublicProfiles } from "@/lib/publicProfile";
import { toUserFacingError } from "@/lib/userFacingError";
import { supabase } from "@/lib/supabaseClient";

/** Matches SpotDrop registration minimum (`isAtLeast13`). */
export const PEOPLE_SEARCH_MIN_AGE = 13;
export const PEOPLE_SEARCH_MAX_AGE = 99;
/** Page size for the People browse / infinite-scroll list. */
export const PEOPLE_BROWSE_PAGE_SIZE = 24;

export type PeopleSearchProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | null;
  /** Integer age only — never store or expose exact DOB. */
  age_years?: number | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
};

export type PeopleBrowseFilters = {
  usernameQuery?: string;
  countrySlug?: string;
  cityId?: string;
  citySlug?: string;
  minAge?: number | null;
  maxAge?: number | null;
  excludeUserIds?: string[];
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
  "id, username, avatar_url, bio, country_slug, city_slug, city_id, age_years, is_online, last_seen_at, is_demo";
const PROFILE_SELECT_NO_BIO =
  "id, username, avatar_url, country_slug, city_slug, city_id, age_years, is_online, last_seen_at, is_demo";
const PROFILE_SELECT_LEGACY =
  "id, username, avatar_url, country_slug, city_slug, city_id, date_of_birth, is_online, last_seen_at";
const PROFILE_SELECT_LEGACY_NO_LAST_SEEN =
  "id, username, avatar_url, country_slug, city_slug, city_id, date_of_birth, is_online";

type RawProfileRow = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | number | null;
  age_years?: number | null;
  date_of_birth?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
  is_demo?: boolean | null;
};

/** Trim + lowercase for slug comparisons (country_slug / city_slug). */
export function normalizePeopleSearchSlug(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

/**
 * Coerce city/country ids from PostgREST (number or string) to a stable string key.
 * HTML <select> values are always strings; profiles often return numeric ids.
 */
export function normalizePeopleSearchId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

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

  const countrySlug = normalizePeopleSearchSlug(row.country_slug);
  const citySlug = normalizePeopleSearchSlug(row.city_slug);
  const cityId = normalizePeopleSearchId(row.city_id);

  const bio = typeof row.bio === "string" ? row.bio.trim() : "";

  return {
    id: row.id,
    username: row.username ?? "",
    avatar_url: row.avatar_url ?? null,
    bio: bio || null,
    country_slug: countrySlug || null,
    city_slug: citySlug || null,
    city_id: cityId || null,
    age_years: ageYears,
    is_online: row.is_online ?? null,
    last_seen_at: row.last_seen_at ?? null,
  };
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

function buildExcludeIdFilter(excludeUserIds: string[] | undefined) {
  const unique = Array.from(
    new Set((excludeUserIds ?? []).map((id) => id.trim()).filter(Boolean))
  );

  if (unique.length === 0) {
    return null;
  }

  return `(${unique.join(",")})`;
}

/**
 * Paginated People browse query.
 * RLS: profiles SELECT is open (`Allow profile read` using true).
 * Exclusions (self / blocked / guides / demo / empty username) applied here + client post-filter.
 */
export async function loadPeopleBrowsePage(
  offset: number,
  limit: number = PEOPLE_BROWSE_PAGE_SIZE,
  filters: PeopleBrowseFilters = {}
): Promise<{
  profiles: PeopleSearchProfile[];
  fetchedCount: number;
  hasMore: boolean;
  error: string | null;
}> {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const excludeFilter = buildExcludeIdFilter(filters.excludeUserIds);
  const usernameQuery = filters.usernameQuery?.trim().toLowerCase() ?? "";
  const countrySlug = normalizePeopleSearchSlug(filters.countrySlug);
  const cityId = normalizePeopleSearchId(filters.cityId);
  const citySlug = normalizePeopleSearchSlug(filters.citySlug);

  const selects = [PROFILE_SELECT, PROFILE_SELECT_NO_BIO, PROFILE_SELECT_LEGACY, PROFILE_SELECT_LEGACY_NO_LAST_SEEN];

  for (const select of selects) {
    let query = supabase
      .from("profiles")
      .select(select)
      .order("username", { ascending: true })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (excludeFilter) {
      query = query.not("id", "in", excludeFilter);
    }

    if (usernameQuery) {
      query = query.ilike("username", `%${escapeIlikePattern(usernameQuery)}%`);
    }

    if (countrySlug) {
      query = query.eq("country_slug", countrySlug);
    }

    if (cityId) {
      // city_id may be int or text in PostgREST — prefer numeric when possible.
      const asNumber = Number(cityId);
      query = query.eq("city_id", Number.isFinite(asNumber) ? asNumber : cityId);
    } else if (citySlug) {
      query = query.eq("city_slug", citySlug);
    }

    if (typeof filters.minAge === "number" && Number.isFinite(filters.minAge)) {
      query = query.gte("age_years", filters.minAge);
    }

    if (typeof filters.maxAge === "number" && Number.isFinite(filters.maxAge)) {
      query = query.lte("age_years", filters.maxAge);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === "42703") {
        continue;
      }

      return {
        profiles: [],
        fetchedCount: 0,
        hasMore: false,
        error: toUserFacingError(error, "Unable to load users."),
      };
    }

    const rows = ((data as unknown as RawProfileRow[]) ?? []).filter((row) => row.is_demo !== true);
    const profiles = sanitizePublicProfiles(
      excludeGuideProfiles(
        rows
          .map(normalizePeopleSearchProfile)
          .filter((profile) => {
            if (!profile.id || !profile.username.trim()) {
              return false;
            }

            if (isGuideAccountUsername(profile.username)) {
              return false;
            }

            return true;
          })
      )
    );

    return {
      profiles,
      fetchedCount: rows.length,
      hasMore: rows.length >= safeLimit,
      error: null,
    };
  }

  return {
    profiles: [],
    fetchedCount: 0,
    hasMore: false,
    error: "Unable to load users.",
  };
}

function normalizeCountryRow(row: {
  id: string | number;
  name: string;
  slug: string;
  emoji?: string | null;
}): PeopleSearchCountry {
  return {
    id: normalizePeopleSearchId(row.id),
    name: row.name,
    slug: normalizePeopleSearchSlug(row.slug),
    emoji: row.emoji ?? null,
  };
}

function normalizeCityRow(row: {
  id: string | number;
  name: string;
  slug: string;
  country_id: string | number;
}): PeopleSearchCity {
  return {
    id: normalizePeopleSearchId(row.id),
    name: row.name,
    slug: normalizePeopleSearchSlug(row.slug),
    country_id: normalizePeopleSearchId(row.country_id),
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

  // Fallbacks for older schemas (missing city_slug / age_years / last_seen_at).
  const fallbackSelects = [
    "id, username, avatar_url, country_slug, city_id, age_years, is_online, last_seen_at",
    PROFILE_SELECT_LEGACY,
    PROFILE_SELECT_LEGACY_NO_LAST_SEEN,
  ] as const;

  for (const select of fallbackSelects) {
    const result = await supabase.from("profiles").select(select).order("username", { ascending: true });

    if (!result.error) {
      return { data: (result.data as unknown as RawProfileRow[]) ?? [], error: null };
    }

    if (result.error.code !== "42703") {
      return { data: [], error: result.error };
    }
  }

  return { data: [], error: modern.error };
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
      countries: (countriesResult.data ?? []).map(normalizeCountryRow),
      cities: (citiesResult.data ?? []).map(normalizeCityRow),
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
    /** Optional city slug for profiles that have city_slug but a missing/mismatched city_id. */
    citySlug?: string;
    onlineOnly: boolean;
    isOnline: (profile: PeopleSearchProfile) => boolean;
  }
) {
  const wantedCountry = normalizePeopleSearchSlug(options.countrySlug);
  const wantedCityId = normalizePeopleSearchId(options.cityId);
  const wantedCitySlug = normalizePeopleSearchSlug(options.citySlug);

  return profiles.filter((profile) => {
    const age = profile.age_years;

    if (typeof age !== "number" || !Number.isFinite(age)) {
      return false;
    }

    if (age < options.minAge || age > options.maxAge) {
      return false;
    }

    if (wantedCountry) {
      const profileCountry = normalizePeopleSearchSlug(profile.country_slug);
      if (profileCountry !== wantedCountry) {
        return false;
      }
    }

    if (wantedCityId || wantedCitySlug) {
      const profileCityId = normalizePeopleSearchId(profile.city_id);
      const profileCitySlug = normalizePeopleSearchSlug(profile.city_slug);
      const idMatch = Boolean(wantedCityId && profileCityId && profileCityId === wantedCityId);
      const slugMatch = Boolean(wantedCitySlug && profileCitySlug && profileCitySlug === wantedCitySlug);

      if (!idMatch && !slugMatch) {
        return false;
      }
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
    citySlug?: string;
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
