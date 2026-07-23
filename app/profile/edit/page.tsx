"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSafeAuthSession } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
import { ensureProfileRow } from "@/lib/profile";
import { uploadAvatarImage } from "@/lib/profileMedia";
import { dispatchProfileMetaRefresh } from "@/lib/profileContentRefresh";
import { pickSpotGalleryPhoto } from "@/lib/pickMediaFromGallery";
import {
  loadProfileGalleryVisibility,
  PROFILE_GALLERY_VISIBILITY_VALUES,
  saveProfileGalleryVisibility,
  type ProfileGalleryVisibility,
} from "@/lib/profileGalleryVisibility";
import { supabase } from "@/lib/supabaseClient";
import AvatarCropScreen from "@/components/AvatarCropScreen";
import ProfileAvatar from "@/components/ProfileAvatar";
import SignOutButton from "@/components/SignOutButton";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeCaughtError, localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import type { TranslationKey } from "@/lib/i18n/messages";
import { toUserFacingError } from "@/lib/userFacingError";

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
const GENDER_VALUES = ["male", "female", "prefer_not_to_say"] as const;
const GENDER_LABEL_KEYS: Record<(typeof GENDER_VALUES)[number], TranslationKey> = {
  male: "profileEdit.gender.male",
  female: "profileEdit.gender.female",
  prefer_not_to_say: "profileEdit.gender.preferNotToSay",
};
const CURRENT_YEAR = new Date().getFullYear();
const MONTH_KEYS: TranslationKey[] = [
  "profileEdit.month.january",
  "profileEdit.month.february",
  "profileEdit.month.march",
  "profileEdit.month.april",
  "profileEdit.month.may",
  "profileEdit.month.june",
  "profileEdit.month.july",
  "profileEdit.month.august",
  "profileEdit.month.september",
  "profileEdit.month.october",
  "profileEdit.month.november",
  "profileEdit.month.december",
];
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, index) => CURRENT_YEAR - index);

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20";

const labelClass = "block text-xs font-medium uppercase tracking-wide text-slate-400";

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
  const { t, locale } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
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
  const [galleryVisibility, setGalleryVisibility] = useState<ProfileGalleryVisibility>("everyone");
  const [savingGalleryVisibility, setSavingGalleryVisibility] = useState(false);

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
        console.error("Failed to load profile countries:", countriesError.code ?? "unknown");
        setError(toUserFacingError(countriesError, "Unable to load countries."));
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

      void loadProfileGalleryVisibility(session.user.id).then(setGalleryVisibility);
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
        return;
      }

      setLoadingCities(true);

      const { data, error: citiesError } = await supabase
        .from("cities")
        .select("id, country_id, name, slug")
        .eq("country_id", selectedCountry.id)
        .order("name", { ascending: true });

      if (citiesError) {
        console.error("Failed to load profile cities:", citiesError.code ?? "unknown");
        setError(toUserFacingError(citiesError, "Unable to load cities."));
        setCityOptions([]);
        setSelectedCitySlug("");
        setLoadingCities(false);
        return;
      }

      const nextCities = data ?? [];
      const selectedCityStillValid = nextCities.some((city) => city.slug === selectedCitySlug);
      const savedCityMatch = savedCityId ? nextCities.find((city) => city.id === savedCityId) : null;
      const nextCitySlug = selectedCityStillValid ? selectedCitySlug : savedCityMatch?.slug ?? "";

      setCityOptions(nextCities);
      setSelectedCitySlug(nextCitySlug);
      setLoadingCities(false);
    };

    void loadCitiesForCountry();
  }, [savedCityId, selectedCitySlug, selectedCountry, selectedCountrySlug]);

  const handlePickAvatar = async () => {
    if (!session?.user?.id || uploadingAvatar || pickingAvatar) {
      return;
    }

    setError(null);
    setPickingAvatar(true);

    try {
      const file = await pickSpotGalleryPhoto();
      if (file) {
        setAvatarCropFile(file);
      }
    } catch (pickError) {
      setError(localizeCaughtError(t, pickError, "common.somethingWentWrong"));
    } finally {
      setPickingAvatar(false);
    }
  };

  const handleAvatarCropConfirm = async (croppedFile: File) => {
    if (!session?.user?.id) {
      setError("Please sign in to upload files.");
      setAvatarCropFile(null);
      return;
    }

    setError(null);
    setUploadingAvatar(true);

    try {
      const publicUrl = await uploadAvatarImage(session.user.id, croppedFile);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);

      if (updateError) {
        console.error("Failed to persist avatar_url:", updateError.code ?? "unknown");
        throw new Error(updateError.message || "Unable to save your profile photo.");
      }

      setFormAvatarUrl(publicUrl);
      dispatchProfileMetaRefresh();
      // Only close the crop screen once the upload AND the profile row are both confirmed saved.
      setAvatarCropFile(null);
    } catch (uploadError) {
      setError(localizeCaughtError(t, uploadError, "common.somethingWentWrong"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleGalleryVisibilityChange = async (nextVisibility: ProfileGalleryVisibility) => {
    if (!session?.user?.id || savingGalleryVisibility || nextVisibility === galleryVisibility) {
      return;
    }

    const previousVisibility = galleryVisibility;
    setGalleryVisibility(nextVisibility);
    setSavingGalleryVisibility(true);
    setError(null);

    const result = await saveProfileGalleryVisibility(session.user.id, nextVisibility);

    if (result.error) {
      console.error("[Gallery privacy] profile edit save failed", result.error);
      setGalleryVisibility(previousVisibility);
      setError(result.error);
    }

    setSavingGalleryVisibility(false);
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
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

    if (!(GENDER_VALUES as readonly string[]).includes(formGender)) {
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
      console.error("Failed to validate profile username uniqueness:", usernameError.code ?? "unknown");
      setError(toUserFacingError(usernameError, "Unable to validate your username."));
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
      console.error("Failed to update profile:", updateError.code ?? "unknown");
      setError(toUserFacingError(updateError, "Unable to save your profile."));
      setSavingProfile(false);
      return;
    }

    window.sessionStorage.setItem("profileUpdated", "1");
    router.push("/profile");
  };

  return (
    <Shell>
      <div className="mx-auto w-full max-w-lg space-y-6 px-1 pb-10 pt-1 sm:max-w-xl">
        <header className="space-y-2">
          <Link
            href="/profile"
            className="inline-flex text-sm text-slate-500 transition hover:text-slate-300"
          >
            ← {t("profileEdit.backToProfile")}
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/90">{t("profileEdit.accountLabel")}</p>
          <h1 className="text-2xl font-semibold text-white">{t("profile.editProfile")}</h1>
          <p className="text-sm text-slate-400">{t("profileEdit.subtitle")}</p>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/50 px-6 py-12 text-center text-sm text-slate-400">
            {t("profile.loading")}
          </div>
        ) : !session?.user?.id ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-6 py-10 text-center">
            <p className="font-medium text-white">{t("profileEdit.signInRequired")}</p>
            <p className="mt-2 text-sm text-slate-400">{t("profileEdit.signInToEdit")}</p>
            <Link
              href="/auth/login"
              className="mt-5 inline-flex rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/5"
            >
              {t("auth.logIn")}
            </Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSaveProfile}>
            <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
              <p className={labelClass}>{t("profileEdit.profilePhoto")}</p>
              <div className="mt-3 flex items-center gap-4">
                <ProfileAvatar
                  src={formAvatarUrl}
                  sizeClassName="h-16 w-16"
                  iconClassName="h-7 w-7"
                  className="border border-white/10 bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => void handlePickAvatar()}
                  disabled={uploadingAvatar || pickingAvatar}
                  className="inline-flex cursor-pointer items-center rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/5 disabled:opacity-50"
                >
                  {uploadingAvatar
                    ? t("profileEdit.uploading")
                    : pickingAvatar
                      ? t("avatarCrop.picking")
                      : t("profileEdit.changePhoto")}
                </button>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
              <p className="text-sm font-medium text-white">{t("profileEdit.basicInfo")}</p>

              <label className="block">
                <span className={labelClass}>{t("profileEdit.name")}</span>
                <span className="ml-1 text-[10px] normal-case text-slate-600">{t("profileEdit.optional")}</span>
                <input
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  autoComplete="name"
                  className={fieldClass}
                  placeholder={t("profileEdit.namePlaceholder")}
                />
              </label>

              <label className="block">
                <span className={labelClass}>{t("common.username")}</span>
                <input
                  value={formUsername}
                  onChange={(event) => setFormUsername(event.target.value.toLowerCase())}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  className={fieldClass}
                  placeholder={t("profileEdit.usernamePlaceholder")}
                />
              </label>

              <label className="block">
                <span className={labelClass}>
                  {t("profileEdit.gender")} <span className="text-cyan-400/80">*</span>
                </span>
                <select
                  value={formGender}
                  onChange={(event) => setFormGender(event.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">{t("profileEdit.selectGender")}</option>
                  {GENDER_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {t(GENDER_LABEL_KEYS[value])}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={labelClass}>{t("profileEdit.bio")}</span>
                <textarea
                  value={formBio}
                  onChange={(event) => setFormBio(event.target.value)}
                  rows={3}
                  className={fieldClass}
                  placeholder={t("profileEdit.bioPlaceholder")}
                />
              </label>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
              <p className="text-sm font-medium text-white">{t("profileEdit.location")}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>
                    {t("profileEdit.country")} <span className="text-cyan-400/80">*</span>
                  </span>
                  <select
                    value={selectedCountrySlug}
                    onChange={(event) => {
                      setSelectedCountrySlug(event.target.value);
                      setSelectedCitySlug("");
                      setSavedCityId("");
                      setCityOptions([]);
                    }}
                    required
                    className={fieldClass}
                  >
                    <option value="">{t("profileEdit.selectCountry")}</option>
                    {countryOptions.map((country) => (
                      <option key={country.id} value={country.slug}>
                        {getCountryFlag(country.slug, country.emoji)}{" "}
                        {localizeCountryName(locale, { slug: country.slug, name: country.name })}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelClass}>
                    {t("profileEdit.city")} <span className="text-cyan-400/80">*</span>
                  </span>
                  <select
                    value={selectedCitySlug}
                    onChange={(event) => setSelectedCitySlug(event.target.value)}
                    disabled={!selectedCountrySlug || loadingCities}
                    required
                    className={fieldClass}
                  >
                    <option value="">
                      {!selectedCountrySlug
                        ? t("profileEdit.selectCountryFirst")
                        : loadingCities
                          ? t("profileEdit.loadingCities")
                          : cityOptions.length === 0
                            ? t("profileEdit.noCitiesFound")
                            : t("profileEdit.selectCity")}
                    </option>
                    {cityOptions.map((city) => (
                      <option key={city.id} value={city.slug}>
                        {localizeCityName(locale, {
                          slug: city.slug,
                          name: city.name,
                          countrySlug: selectedCountrySlug,
                        })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
              <label className="block">
                <span className={labelClass}>
                  {t("profileEdit.dateOfBirth")} <span className="text-cyan-400/80">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <select
                    value={birthDay}
                    onChange={(event) => setBirthDay(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">{t("profileEdit.day")}</option>
                    {DAY_OPTIONS.map((day) => (
                      <option key={day} value={String(day)}>
                        {day}
                      </option>
                    ))}
                  </select>

                  <select
                    value={birthMonth}
                    onChange={(event) => setBirthMonth(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">{t("profileEdit.month")}</option>
                    {MONTH_KEYS.map((monthKey, index) => (
                      <option key={monthKey} value={String(index + 1)}>
                        {t(monthKey)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={birthYear}
                    onChange={(event) => setBirthYear(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">{t("profileEdit.year")}</option>
                    {YEAR_OPTIONS.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">{t("profileEdit.privacyTitle")}</p>
                {savingGalleryVisibility ? (
                  <p className="text-xs text-slate-500">{t("profileEdit.galleryVisibilitySaving")}</p>
                ) : null}
              </div>

              <div>
                <p className={labelClass}>{t("profile.galleryVisibility.sectionTitle")}</p>
                <div className="mt-3 space-y-2">
                  {PROFILE_GALLERY_VISIBILITY_VALUES.map((value) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition ${
                        galleryVisibility === value
                          ? "border-cyan-400/40 bg-cyan-400/10"
                          : "border-white/10 bg-slate-950/50 hover:border-white/15"
                      }`}
                    >
                      <input
                        type="radio"
                        name="galleryVisibility"
                        value={value}
                        checked={galleryVisibility === value}
                        disabled={savingGalleryVisibility}
                        onChange={() => void handleGalleryVisibilityChange(value)}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      <span className="text-sm font-medium text-white">
                        {t(
                          value === "everyone"
                            ? "profile.galleryVisibility.everyone"
                            : value === "followers"
                              ? "profile.galleryVisibility.followers"
                              : value === "friends"
                                ? "profile.galleryVisibility.friends"
                                : "profile.galleryVisibility.selected"
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {galleryVisibility === "selected" ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {t("settings.galleryPrivacy.selectedHint")}
                  </p>
                ) : null}
              </div>
            </section>

            {error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                {localizeUserMessage(t, error) ?? error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <Link
                href="/profile"
                className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                {t("common.cancel")}
              </Link>
              <button
                type="submit"
                disabled={savingProfile || uploadingAvatar}
                className="inline-flex items-center rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingProfile ? t("common.saving") : t("profileEdit.save")}
              </button>
            </div>

            <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
              <p className="text-sm font-medium text-white">{t("profileEdit.accountLabel")}</p>
              <p className="text-sm text-slate-400">{t("profileEdit.signOutSection")}</p>
              <SignOutButton />
            </section>
          </form>
        )}
      </div>

      {avatarCropFile ? (
        <AvatarCropScreen
          file={avatarCropFile}
          busy={uploadingAvatar}
          onCancel={() => {
            if (!uploadingAvatar) {
              setAvatarCropFile(null);
            }
          }}
          onConfirm={(cropped) => {
            void handleAvatarCropConfirm(cropped);
          }}
        />
      ) : null}
    </Shell>
  );
}
