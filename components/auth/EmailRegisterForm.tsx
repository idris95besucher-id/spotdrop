"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import AuthSearchableSelect from "@/components/auth/AuthSearchableSelect";
import PasswordField from "@/components/auth/PasswordField";
import { useI18n } from "@/components/I18nProvider";
import { authInputClass, authPrimaryButtonClass, authLabelClass } from "@/components/auth/authStyles";
import {
  mapAuthError,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
} from "@/lib/authMessages";
import { logAuthSessionError } from "@/lib/authSession";
import { getCountryFlag } from "@/lib/countryFlags";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import type { TranslationKey } from "@/lib/i18n/messages";
import { ensureProfileRow } from "@/lib/profile";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;
const CURRENT_YEAR = new Date().getFullYear();
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, index) => CURRENT_YEAR - index);
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

type CountryOption = {
  id: string | number;
  name: string;
  slug: string;
  emoji?: string | null;
};

type CityOption = {
  id: string | number;
  name: string;
  slug: string;
  country_id: string | number;
};

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

export default function EmailRegisterForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [selectedCountrySlug, setSelectedCountrySlug] = useState("");
  const [selectedCitySlug, setSelectedCitySlug] = useState("");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCountry = countryOptions.find((country) => country.slug === selectedCountrySlug) ?? null;
  const selectedCity = cityOptions.find((city) => city.slug === selectedCitySlug) ?? null;

  useEffect(() => {
    const loadCountries = async () => {
      setLoadingCountries(true);

      const { data, error: countriesError } = await supabase
        .from("countries")
        .select("id, name, slug, emoji")
        .order("name", { ascending: true });

      if (countriesError) {
        console.error("Failed to load registration countries:", countriesError.code ?? "unknown");
        setError(t("profileEdit.error.loadCountries"));
        setCountryOptions([]);
        setLoadingCountries(false);
        return;
      }

      setCountryOptions(data ?? []);
      setLoadingCountries(false);
    };

    void loadCountries();
  }, [t]);

  useEffect(() => {
    const countryId = selectedCountry?.id;

    const loadCitiesForCountry = async () => {
      if (!countryId) {
        setCityOptions([]);
        setSelectedCitySlug("");
        setLoadingCities(false);
        return;
      }

      setLoadingCities(true);
      setSelectedCitySlug("");

      const { data, error: citiesError } = await supabase
        .from("cities")
        .select("id, country_id, name, slug")
        .eq("country_id", countryId)
        .order("name", { ascending: true });

      if (citiesError) {
        console.error("Failed to load registration cities:", citiesError.code ?? "unknown");
        setError(t("profileEdit.error.loadCities"));
        setCityOptions([]);
        setSelectedCitySlug("");
        setLoadingCities(false);
        return;
      }

      setCityOptions(data ?? []);
      setLoadingCities(false);
    };

    void loadCitiesForCountry();
  }, [selectedCountry?.id, t]);

  const countrySelectOptions = useMemo(
    () =>
      countryOptions.map((country) => {
        const label = localizeCountryName(locale, {
          slug: country.slug,
          name: country.name,
        });

        return {
          value: country.slug,
          label,
          leading: getCountryFlag(country.slug, country.emoji),
          searchText: `${country.name} ${country.slug}`,
        };
      }),
    [countryOptions, locale]
  );

  const citySelectOptions = useMemo(
    () =>
      cityOptions.map((city) => {
        const label = localizeCityName(locale, {
          slug: city.slug,
          name: city.name,
          countrySlug: selectedCountrySlug,
        });

        return {
          value: city.slug,
          label,
          searchText: `${city.name} ${city.slug}`,
        };
      }),
    [cityOptions, locale, selectedCountrySlug]
  );

  const cityPlaceholder = !selectedCountrySlug
    ? t("profileEdit.selectCountryFirst")
    : loadingCities
      ? t("profileEdit.loadingCities")
      : cityOptions.length === 0
        ? t("profileEdit.noCitiesFound")
        : t("profileEdit.selectCity");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (supabaseConfigError) {
        setError(t("auth.error.signupDisabled"));
        return;
      }

      const trimmedEmail = email.trim();
      const normalizedUsername = username.trim().toLowerCase();

      if (!trimmedEmail) {
        setError(t("auth.error.emailRequired"));
        return;
      }

      if (!USERNAME_REGEX.test(normalizedUsername)) {
        setError(t("auth.error.usernameInvalid"));
        return;
      }

      if (!birthDay || !birthMonth || !birthYear) {
        setError(t("profileEdit.error.birthRequired"));
        return;
      }

      const dateOfBirth = buildDateOfBirth(birthYear, birthMonth, birthDay);

      if (!dateOfBirth) {
        setError(t("profileEdit.error.birthInvalid"));
        return;
      }

      if (!isAtLeast13(birthYear, birthMonth, birthDay)) {
        setError(t("profileEdit.error.minAge"));
        return;
      }

      if (!selectedCountry || !selectedCountrySlug) {
        setError(t("profileEdit.error.countryRequired"));
        return;
      }

      if (!selectedCity || !selectedCitySlug) {
        setError(t("profileEdit.error.cityRequired"));
        return;
      }

      if (password.length < 8) {
        setError(PASSWORD_TOO_SHORT_MESSAGE);
        return;
      }

      if (password !== confirmPassword) {
        setError(PASSWORD_MISMATCH_MESSAGE);
        return;
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle();

      if (existingProfileError) {
        setError(t("auth.error.usernameValidateFailed"));
        return;
      }

      if (existingProfile) {
        setError(t("auth.error.usernameTaken"));
        return;
      }

      const cityId = String(selectedCity.id);
      const signUpMetadata = {
        username: normalizedUsername,
        date_of_birth: dateOfBirth,
        country: selectedCountry.slug,
        city: selectedCity.slug,
        city_id: cityId,
      };

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: signUpMetadata,
        },
      });

      if (signUpError) {
        logAuthSessionError(signUpError);
        setError(mapAuthError(signUpError, "Unable to create your account. Please try again."));
        return;
      }

      const authUser = data.user ?? data.session?.user;

      if (!authUser?.id) {
        setError(t("auth.error.checkEmailConfirm"));
        return;
      }

      // Supabase often returns a user without a session for existing emails
      // (confirm-email / duplicate obfuscation). Treat empty identities as taken.
      const identities = (authUser as { identities?: unknown[] }).identities;
      if (!data.session && Array.isArray(identities) && identities.length === 0) {
        setError(t("auth.error.emailExists"));
        return;
      }

      if (!data.session) {
        setError(t("auth.error.accountCreatedConfirm"));
        return;
      }

      const ensureProfileResult = await ensureProfileRow({
        user: authUser,
        username: normalizedUsername,
        dateOfBirth,
        country: selectedCountry.slug,
        city: selectedCity.slug,
        cityId,
      });

      if (ensureProfileResult.error) {
        setError(ensureProfileResult.error);
        return;
      }

      router.push("/profile");
    } catch (caught) {
      logAuthSessionError(caught);
      setError(mapAuthError(caught, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="min-w-0 space-y-4">
      <label htmlFor="register-email" className={authLabelClass}>
        {t("common.email")}
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          className={authInputClass}
        />
      </label>

      <label htmlFor="register-username" className={authLabelClass}>
        {t("common.username")}
        <input
          id="register-username"
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("auth.usernamePlaceholder")}
          className={authInputClass}
        />
      </label>

      <div>
        <span className={authLabelClass}>
          {t("profileEdit.dateOfBirth")} <span className="text-cyan-400/80">*</span>
        </span>
        <div className="mt-1.5 grid min-w-0 grid-cols-3 gap-2">
          <label htmlFor="register-birth-day" className="sr-only">
            {t("profileEdit.day")}
          </label>
          <select
            id="register-birth-day"
            value={birthDay}
            onChange={(event) => setBirthDay(event.target.value)}
            className={authInputClass}
            required
          >
            <option value="">{t("profileEdit.day")}</option>
            {DAY_OPTIONS.map((day) => (
              <option key={day} value={String(day)}>
                {day}
              </option>
            ))}
          </select>

          <label htmlFor="register-birth-month" className="sr-only">
            {t("profileEdit.month")}
          </label>
          <select
            id="register-birth-month"
            value={birthMonth}
            onChange={(event) => setBirthMonth(event.target.value)}
            className={authInputClass}
            required
          >
            <option value="">{t("profileEdit.month")}</option>
            {MONTH_KEYS.map((monthKey, index) => (
              <option key={monthKey} value={String(index + 1)}>
                {t(monthKey)}
              </option>
            ))}
          </select>

          <label htmlFor="register-birth-year" className="sr-only">
            {t("profileEdit.year")}
          </label>
          <select
            id="register-birth-year"
            value={birthYear}
            onChange={(event) => setBirthYear(event.target.value)}
            className={authInputClass}
            required
          >
            <option value="">{t("profileEdit.year")}</option>
            {YEAR_OPTIONS.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      <AuthSearchableSelect
        id="register-country"
        label={t("profileEdit.country")}
        value={selectedCountrySlug}
        options={countrySelectOptions}
        placeholder={loadingCountries ? t("common.loading") : t("profileEdit.selectCountry")}
        searchPlaceholder={t("map.sharePlace.searchCountries")}
        emptyMessage={t("rooms.noCountries")}
        disabled={loadingCountries || loading}
        required
        onChange={(nextSlug) => {
          setSelectedCountrySlug(nextSlug);
          setSelectedCitySlug("");
          setError(null);
        }}
      />

      <AuthSearchableSelect
        id="register-city"
        label={t("profileEdit.city")}
        value={selectedCitySlug}
        options={citySelectOptions}
        placeholder={cityPlaceholder}
        searchPlaceholder={t("map.sharePlace.searchCities")}
        emptyMessage={t("profileEdit.noCitiesFound")}
        disabled={!selectedCountrySlug || loadingCities || loading}
        required
        onChange={(nextSlug) => {
          setSelectedCitySlug(nextSlug);
          setError(null);
        }}
      />

      <PasswordField
        id="register-password"
        label={t("common.password")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={t("auth.passwordHint")}
      />

      <PasswordField
        id="register-confirm-password"
        label={t("auth.confirmPassword")}
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
      />

      {error ? (
        <p className="text-sm text-red-400">
          {localizeUserMessage(t, error) ?? t("auth.error.registrationFailed")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading || loadingCountries || !selectedCountrySlug || !selectedCitySlug}
        className={authPrimaryButtonClass}
      >
        {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
      </button>
    </form>
  );
}
