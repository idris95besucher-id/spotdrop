"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSafeAuthSession } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
import { ensureProfileRow } from "@/lib/profile";
import { uploadAvatarImage } from "@/lib/profileMedia";
import { supabase } from "@/lib/supabaseClient";
import Shell from "@/components/Shell";

type CountryOption = {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
};

type CityOption = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;
const GENDER_VALUES = GENDER_OPTIONS.map((option) => option.value) as string[];
const CURRENT_YEAR = new Date().getFullYear();
const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, index) => CURRENT_YEAR - index);

function buildDateOfBirth(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!year || !month || !day) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isAtLeast13(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const today = new Date();

  let age = today.getFullYear() - year;
  const hasHadBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 13;
}

function splitDateOfBirth(dateOfBirth: string | null | undefined) {
  if (!dateOfBirth) {
    return {
      year: "",
      month: "",
      day: "",
    };
  }

  const [year = "", month = "", day = ""] = dateOfBirth.split("-");
  return { year, month, day };
}

export default function EditProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formAvatarUrl, setFormAvatarUrl] = useState("");
  const [formBio, setFormBio] = useState("");
  const [selectedCountrySlug, setSelectedCountrySlug] = useState("");
  const [selectedCitySlug, setSelectedCitySlug] = useState("");
  const [savedCityId, setSavedCityId] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      const { session, error: sessionError } = await getSafeAuthSession();

      setSession(session);

      if (sessionError) {
        setError(sessionError);
        setLoading(false);
        return;
      }

      if (!session?.user) {
        setLoading(false);
        return;
      }

      const ensuredProfile = await ensureProfileRow({ user: session.user });

      if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
        setError(ensuredProfile.error);
      }

      if (!ensuredProfile.profile?.username) {
        router.push("/onboarding");
        return;
      }

      const { data: countriesData, error: countriesError } = await supabase
        .from("countries")
        .select("id, name, slug, emoji")
        .order("name", { ascending: true });

      if (countriesError) {
        console.error("Failed to load profile countries:", JSON.stringify(countriesError, null, 2));
        setError(countriesError.message || "Unable to load countries.");
      } else {
        setCountryOptions(countriesData ?? []);
      }

      const profileData = ensuredProfile.profile;
      const dateParts = splitDateOfBirth(profileData?.date_of_birth);

      setFormName(profileData?.name ?? "");
      setFormUsername(profileData?.username ?? "");
      setFormGender(profileData?.gender ?? "");
      setFormAvatarUrl(profileData?.avatar_url ?? "");
      setFormBio(profileData?.bio ?? "");
      setSelectedCountrySlug(profileData?.country_slug ?? "");
      setSelectedCitySlug(profileData?.city_slug ?? "");
      setSavedCityId(profileData?.city_id ?? "");
      setBirthYear(dateParts.year);
      setBirthMonth(dateParts.month);
      setBirthDay(dateParts.day);
      setLoading(false);
    };

    void loadProfile();
  }, [router]);

  const selectedCountry = countryOptions.find((country) => country.slug === selectedCountrySlug) ?? null;
  const selectedCity = cityOptions.find((city) => city.slug === selectedCitySlug) ?? null;

  useEffect(() => {
    const loadCitiesForCountry = async () => {
      if (!selectedCountry) {
        setCityOptions([]);
        setSelectedCitySlug("");
        setLoadingCities(false);
        console.log("selected country slug:", selectedCountrySlug);
        console.log("loaded cities count:", 0);
        console.log("selected city slug:", "");
        return;
      }

      setLoadingCities(true);
      console.log("selected country slug:", selectedCountry.slug);

      const { data, error: citiesError } = await supabase
        .from("cities")
        .select("id, country_id, name, slug")
        .eq("country_id", selectedCountry.id)
        .order("name", { ascending: true });

      if (citiesError) {
        console.error("Failed to load profile cities:", citiesError);
        setError(citiesError.message || "Unable to load cities.");
        setCityOptions([]);
        setSelectedCitySlug("");
        setLoadingCities(false);
        console.log("loaded cities count:", 0);
        console.log("selected city slug:", "");
        return;
      }

      const nextCities = data ?? [];
      const selectedCityStillValid = nextCities.some((city) => city.slug === selectedCitySlug);
      const savedCityMatch = savedCityId ? nextCities.find((city) => city.id === savedCityId) : null;
      const nextCitySlug = selectedCityStillValid ? selectedCitySlug : savedCityMatch?.slug ?? "";

      setCityOptions(nextCities);
      setSelectedCitySlug(nextCitySlug);
      setLoadingCities(false);
      console.log("loaded cities count:", nextCities.length);
      console.log("selected city slug:", nextCitySlug);
    };

    void loadCitiesForCountry();
  }, [savedCityId, selectedCitySlug, selectedCountry, selectedCountrySlug]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!session?.user?.id) {
      setError("Please sign in to upload files.");
      event.target.value = "";
      return;
    }

    setError(null);
    setUploadingAvatar(true);

    try {
      const publicUrl = await uploadAvatarImage(session.user.id, file);
      setFormAvatarUrl(publicUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload profile photo.");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session?.user?.id) {
      setError("Please sign in first.");
      return;
    }

    const normalizedUsername = formUsername.trim().toLowerCase();

    if (!normalizedUsername) {
      setError("Username is required.");
      return;
    }

    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setError("Username must be 3-30 characters and use only lowercase letters, numbers, dots, or underscores.");
      return;
    }

    if (!birthDay || !birthMonth || !birthYear) {
      setError("Day, month, and year of birth are required.");
      return;
    }

    const dateOfBirth = buildDateOfBirth(birthYear, birthMonth, birthDay);

    if (!dateOfBirth) {
      setError("Please select a valid date of birth.");
      return;
    }

    if (!isAtLeast13(birthYear, birthMonth, birthDay)) {
      setError("You must be at least 13 years old.");
      return;
    }

    if (!GENDER_VALUES.includes(formGender)) {
      setError("Gender is required.");
      return;
    }

    if (!selectedCountry) {
      setError("Country is required.");
      return;
    }

    if (!selectedCity) {
      setError("City is required.");
      return;
    }

    setSavingProfile(true);
    setError(null);

    const { data: existingUser, error: usernameError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalizedUsername)
      .neq("id", session.user.id)
      .maybeSingle();

    if (usernameError) {
      console.error("Failed to validate profile username uniqueness:", usernameError);
      setError(usernameError.message || "Unable to validate your username.");
      setSavingProfile(false);
      return;
    }

    if (existingUser) {
      setError("That username is already taken.");
      setSavingProfile(false);
      return;
    }

    const profilePayload = {
      name: formName.trim() || null,
      username: normalizedUsername,
      gender: formGender,
      avatar_url: formAvatarUrl || null,
      bio: formBio.trim() || null,
      country_slug: selectedCountry.slug,
      city_slug: selectedCity.slug,
      city_id: selectedCity.id,
      date_of_birth: dateOfBirth,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update(profilePayload)
      .eq("id", session.user.id);

    if (updateError) {
      console.error("Failed to update profile:", updateError);
      setError(updateError.message || "Unable to save your profile.");
      setSavingProfile(false);
      return;
    }

    window.sessionStorage.setItem("profileUpdated", "1");
    router.push("/profile");
  };

  return (
    <Shell>
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl shadow-black/40">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Edit profile</p>
          <h1 className="text-4xl font-semibold text-white">Update your SpotDrop profile.</h1>
          <p className="text-slate-300">Manage your public profile details here. Email always stays private.</p>
        </div>

        {loading ? (
          <div className="mt-8 rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">Loading profile editor…</div>
        ) : !session?.user?.id ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-slate-300">
            <p className="text-lg font-semibold text-white">You must be signed in.</p>
            <p className="mt-3 text-slate-400">Login to edit your profile.</p>
            <Link href="/auth/login" className="mt-6 inline-flex rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Login
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSaveProfile}>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-slate-900 p-4">
                  <p className="text-sm text-slate-300">Profile photo</p>
                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-2xl font-semibold text-white">
                      {formAvatarUrl ? (
                        <img src={formAvatarUrl} alt="Profile avatar preview" className="h-full w-full object-cover" />
                      ) : (
                        formUsername.trim().charAt(0).toUpperCase() || "?"
                      )}
                    </div>
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-3xl bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10">
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                      {uploadingAvatar ? "Uploading..." : "Upload profile photo"}
                    </label>
                  </div>
                </div>

              </div>

              <div className="space-y-4">
                <label className="block text-sm text-slate-300">
                  Name <span className="text-slate-500">(optional)</span>
                  <input
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    autoComplete="name"
                    className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                    placeholder="First name or full name"
                  />
                </label>

                <label className="block text-sm text-slate-300">
                  Username
                  <input
                    value={formUsername}
                    onChange={(event) => setFormUsername(event.target.value.toLowerCase())}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  />
                </label>

                <label className="block text-sm text-slate-300">
                  Gender <span className="text-red-300">*</span>
                  <select
                    value={formGender}
                    onChange={(event) => setFormGender(event.target.value)}
                    required
                    className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  >
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-slate-300">
                  Bio
                  <textarea
                    value={formBio}
                    onChange={(event) => setFormBio(event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-300">
                    Country <span className="text-red-300">*</span>
                    <select
                      value={selectedCountrySlug}
                      onChange={(event) => {
                        setSelectedCountrySlug(event.target.value);
                        setSelectedCitySlug("");
                        setSavedCityId("");
                        setCityOptions([]);
                      }}
                      required
                      className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    >
                      <option value="">Select country</option>
                      {countryOptions.map((country) => (
                        <option key={country.id} value={country.slug}>
                          {getCountryFlag(country.slug, country.emoji)} {country.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm text-slate-300">
                    City <span className="text-red-300">*</span>
                    <select
                      value={selectedCitySlug}
                      onChange={(event) => {
                        setSelectedCitySlug(event.target.value);
                        console.log("selected city slug:", event.target.value);
                      }}
                      disabled={!selectedCountrySlug || loadingCities}
                      required
                      className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">
                        {!selectedCountrySlug
                          ? "Select country first"
                          : loadingCities
                            ? "Loading cities..."
                            : cityOptions.length === 0
                              ? "No cities found"
                              : "Select city"}
                      </option>
                      {cityOptions.map((city) => (
                        <option key={city.id} value={city.slug}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block text-sm text-slate-300">
                  Date of birth
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <select
                      value={birthDay}
                      onChange={(event) => setBirthDay(event.target.value)}
                      className="w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    >
                      <option value="">Day</option>
                      {DAY_OPTIONS.map((day) => (
                        <option key={day} value={String(day)}>
                          {day}
                        </option>
                      ))}
                    </select>

                    <select
                      value={birthMonth}
                      onChange={(event) => setBirthMonth(event.target.value)}
                      className="w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    >
                      <option value="">Month</option>
                      {MONTH_OPTIONS.map((month, index) => (
                        <option key={month} value={String(index + 1)}>
                          {month}
                        </option>
                      ))}
                    </select>

                    <select
                      value={birthYear}
                      onChange={(event) => setBirthYear(event.target.value)}
                      className="w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    >
                      <option value="">Year</option>
                      {YEAR_OPTIONS.map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
            </div>

            {error ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">{error}</div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/profile"
                className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Back to profile
              </Link>
              <button
                type="submit"
                disabled={savingProfile || uploadingAvatar}
                className="inline-flex items-center justify-center rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProfile ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Shell>
  );
}
