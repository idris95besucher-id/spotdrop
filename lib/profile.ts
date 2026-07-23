import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { toUserFacingError } from "@/lib/userFacingError";

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;
const DATE_OF_BIRTH_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type ProfileRecord = {
  id: string;
  name?: string | null;
  username?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | null;
};

type EnsureProfileOptions = {
  user: User;
  username?: string | null;
  dateOfBirth?: string | null;
  country?: string | null;
  city?: string | null;
  cityId?: string | null;
};

function normalizeOptionalSlug(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export type EnsureProfileResult = {
  created: boolean;
  error: string | null;
  needsOnboarding: boolean;
  profile: ProfileRecord | null;
};

const PROFILE_SELECT_WITH_LOCATION =
  "id, name, username, gender, avatar_url, cover_url, bio, country_slug, city_slug, city_id, age_years";
const PROFILE_SELECT_LEGACY =
  "id, name, username, gender, date_of_birth, avatar_url, cover_url, bio, country_slug, city_slug, city_id";

function normalizeUsername(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return USERNAME_REGEX.test(normalized) ? normalized : null;
}

function normalizeDateOfBirth(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return DATE_OF_BIRTH_REGEX.test(normalized) ? normalized : null;
}

async function loadOwnDateOfBirth() {
  const { data, error } = await supabase.rpc("get_own_date_of_birth");

  if (error) {
    // Migration not applied yet — callers may still get DOB from a legacy select.
    return null;
  }

  return typeof data === "string" ? data : null;
}

async function loadProfileRecord(userId: string) {
  const modern = await supabase.from("profiles").select(PROFILE_SELECT_WITH_LOCATION).eq("id", userId).maybeSingle();

  if (!modern.error) {
    const dob = await loadOwnDateOfBirth();
    return {
      data: modern.data
        ? {
            ...modern.data,
            date_of_birth: dob,
          }
        : null,
      error: null,
    };
  }

  // Fallback when age_years column is missing (pre-migration).
  const legacy = await supabase.from("profiles").select(PROFILE_SELECT_LEGACY).eq("id", userId).maybeSingle();
  return legacy;
}

export async function ensureProfileRow({
  user,
  username,
  dateOfBirth,
  country,
  city,
  cityId,
}: EnsureProfileOptions): Promise<EnsureProfileResult> {
  const { data: existingProfile, error: existingProfileError } = await loadProfileRecord(user.id);

  if (existingProfileError) {
    console.error("Failed to load existing profile row:", existingProfileError);
    return {
      created: false,
      error: toUserFacingError(existingProfileError, "Unable to load your profile."),
      needsOnboarding: false,
      profile: null,
    };
  }

  if (existingProfile?.username) {
    return {
      created: false,
      error: null,
      needsOnboarding: false,
      profile: existingProfile,
    };
  }

  const normalizedUsername = normalizeUsername(username ?? user.user_metadata?.username);
  const normalizedDateOfBirth = normalizeDateOfBirth(dateOfBirth ?? user.user_metadata?.date_of_birth);
  const normalizedCountrySlug = normalizeOptionalSlug(
    country ?? user.user_metadata?.country ?? user.user_metadata?.country_slug
  );
  const normalizedCitySlug = normalizeOptionalSlug(
    city ?? user.user_metadata?.city ?? user.user_metadata?.city_slug
  );
  const normalizedCityId = normalizeOptionalId(cityId ?? user.user_metadata?.city_id);

  if (!normalizedUsername || !normalizedDateOfBirth) {
    return {
      created: false,
      error: "Complete your profile to continue.",
      needsOnboarding: true,
      profile: existingProfile ?? null,
    };
  }

  const { data: conflictingProfile, error: conflictingProfileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", normalizedUsername)
    .neq("id", user.id)
    .maybeSingle();

  if (conflictingProfileError) {
    console.error("Failed to validate profile username uniqueness:", conflictingProfileError);
    return {
      created: false,
      error: toUserFacingError(conflictingProfileError, "Unable to validate your username."),
      needsOnboarding: false,
      profile: existingProfile ?? null,
    };
  }

  if (conflictingProfile) {
    return {
      created: false,
      error: "That username is already taken.",
      needsOnboarding: true,
      profile: existingProfile ?? null,
    };
  }

  const profilePayload = {
    id: user.id,
    username: normalizedUsername,
    date_of_birth: normalizedDateOfBirth,
    ...(normalizedCountrySlug ? { country_slug: normalizedCountrySlug } : {}),
    ...(normalizedCitySlug ? { city_slug: normalizedCitySlug } : {}),
    ...(normalizedCityId ? { city_id: normalizedCityId } : {}),
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(profilePayload)
    .select("id")
    .single();

  if (upsertError) {
    console.error("Failed to ensure profile row:", upsertError, profilePayload);
    return {
      created: false,
      error: toUserFacingError(upsertError, "Unable to create your profile."),
      needsOnboarding: false,
      profile: existingProfile ?? null,
    };
  }

  const { data: upsertedProfile, error: refreshedProfileError } = await loadProfileRecord(user.id);

  if (refreshedProfileError) {
    console.error("Failed to reload ensured profile row:", refreshedProfileError);
    return {
      created: false,
      error: toUserFacingError(refreshedProfileError, "Unable to load your profile after creation."),
      needsOnboarding: false,
      profile: existingProfile ?? null,
    };
  }

  return {
    created: true,
    error: null,
    needsOnboarding: false,
    profile: upsertedProfile,
  };
}
