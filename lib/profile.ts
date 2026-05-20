import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

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
  is_ai_guide?: boolean | null;
  is_official?: boolean | null;
};

type EnsureProfileOptions = {
  user: User;
  username?: string | null;
  dateOfBirth?: string | null;
};

export type EnsureProfileResult = {
  created: boolean;
  error: string | null;
  needsOnboarding: boolean;
  profile: ProfileRecord | null;
};

const PROFILE_SELECT_WITH_LOCATION = "id, name, username, gender, date_of_birth, avatar_url, cover_url, bio, country_slug, city_slug, city_id, is_ai_guide, is_official";
const PROFILE_SELECT_FALLBACK = "id, name, username, gender, date_of_birth, avatar_url, cover_url, bio, city_id";

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

async function loadProfileRecord(userId: string) {
  const primaryResult = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_WITH_LOCATION)
    .eq("id", userId)
    .maybeSingle();

  if (
    primaryResult.error &&
    primaryResult.error.code === "42703"
  ) {
    const fallbackResult = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_FALLBACK)
      .eq("id", userId)
      .maybeSingle();

    return {
      data: fallbackResult.data
        ? { ...fallbackResult.data, name: null, gender: null, country_slug: null, city_slug: null, is_ai_guide: false, is_official: false }
        : null,
      error: fallbackResult.error,
    };
  }

  return primaryResult;
}

export async function ensureProfileRow({ user, username, dateOfBirth }: EnsureProfileOptions): Promise<EnsureProfileResult> {
  const { data: existingProfile, error: existingProfileError } = await loadProfileRecord(user.id);

  if (existingProfileError) {
    console.error("Failed to load existing profile row:", existingProfileError);
    return {
      created: false,
      error: existingProfileError.message || "Unable to load your profile.",
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
      error: conflictingProfileError.message || "Unable to validate your username.",
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
      error: upsertError.message || "Unable to create your profile.",
      needsOnboarding: false,
      profile: existingProfile ?? null,
    };
  }

  const { data: upsertedProfile, error: refreshedProfileError } = await loadProfileRecord(user.id);

  if (refreshedProfileError) {
    console.error("Failed to reload ensured profile row:", refreshedProfileError);
    return {
      created: false,
      error: refreshedProfileError.message || "Unable to load your profile after creation.",
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
