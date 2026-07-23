"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { getCountryFlag } from "@/lib/countryFlags";
import { localizeCityName, localizeCountryName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  PEOPLE_SEARCH_MAX_AGE,
  PEOPLE_SEARCH_MIN_AGE,
  validatePeopleSearchAgeRange,
  type PeopleSearchAgeValidationError,
} from "@/lib/peopleSearch";
import {
  loadFiltersSearchState,
  saveFiltersSearchState,
} from "@/lib/peopleSearchSession";
import { usePeopleSearchCatalog } from "@/lib/usePeopleSearchCatalog";
import { composerPaddingBottom, useKeyboard } from "@/lib/keyboardSystem";

const FIELD_CLASS =
  "mt-1.5 h-11 w-full rounded-[14px] border border-white/[0.06] bg-[#0c0e14] px-3 text-[15px] text-white outline-none transition focus:border-white/15 focus:bg-[#10131a] disabled:opacity-55";

export default function PeopleFiltersSearchScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { catalog, loading, error } = usePeopleSearchCatalog();
  const { isKeyboardOpen } = useKeyboard();

  const [minInput, setMinInput] = useState("18");
  const [maxInput, setMaxInput] = useState(String(PEOPLE_SEARCH_MAX_AGE));
  const [countrySlug, setCountrySlug] = useState("");
  const [cityId, setCityId] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [validationError, setValidationError] = useState<PeopleSearchAgeValidationError | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = loadFiltersSearchState();
    setMinInput(saved.minInput);
    setMaxInput(saved.maxInput);
    setCountrySlug(saved.countrySlug);
    setCityId(saved.cityId);
    setOnlineOnly(saved.onlineOnly);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const saved = loadFiltersSearchState();
    saveFiltersSearchState({
      ...saved,
      minInput,
      maxInput,
      countrySlug,
      cityId,
      onlineOnly,
    });
  }, [hydrated, minInput, maxInput, countrySlug, cityId, onlineOnly]);

  const selectedCountry = useMemo(
    () => catalog.countries.find((country) => country.slug === countrySlug) ?? null,
    [catalog.countries, countrySlug]
  );

  const availableCities = useMemo(() => {
    if (!selectedCountry) {
      return [];
    }

    return catalog.cities.filter((city) => city.country_id === selectedCountry.id);
  }, [catalog.cities, selectedCountry]);

  const selectedCity = useMemo(
    () => availableCities.find((city) => city.id === cityId) ?? null,
    [availableCities, cityId]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validatePeopleSearchAgeRange(minInput, maxInput);

    if (validation) {
      setValidationError(validation);
      return;
    }

    setValidationError(null);
    setSubmitting(true);

    const nextMin = Number(minInput.trim());
    const nextMax = Number(maxInput.trim());
    const nextCountry = countrySlug;
    const nextCity = cityId;
    const nextCitySlug = selectedCity?.slug ?? "";
    const nextOnline = onlineOnly;

    saveFiltersSearchState({
      minInput,
      maxInput,
      countrySlug: nextCountry,
      cityId: nextCity,
      onlineOnly: nextOnline,
      appliedMin: nextMin,
      appliedMax: nextMax,
      appliedCountrySlug: nextCountry,
      appliedCityId: nextCity,
      appliedCitySlug: nextCitySlug,
      appliedOnlineOnly: nextOnline,
      hasSearched: true,
    });

    router.push("/search/people");
  };

  const resetFilters = () => {
    setMinInput("18");
    setMaxInput(String(PEOPLE_SEARCH_MAX_AGE));
    setCountrySlug("");
    setCityId("");
    setOnlineOnly(false);
    setValidationError(null);
    saveFiltersSearchState({
      minInput: "18",
      maxInput: String(PEOPLE_SEARCH_MAX_AGE),
      countrySlug: "",
      cityId: "",
      onlineOnly: false,
      appliedMin: null,
      appliedMax: null,
      appliedCountrySlug: "",
      appliedCityId: "",
      appliedCitySlug: "",
      appliedOnlineOnly: false,
      hasSearched: false,
    });
  };

  const localizedError = localizeUserMessage(t, error);
  const validationMessage = validationError
    ? t(validationError, {
        min: PEOPLE_SEARCH_MIN_AGE,
        max: PEOPLE_SEARCH_MAX_AGE,
      })
    : null;
  const formPad = composerPaddingBottom("fullscreen", isKeyboardOpen);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="shrink-0 space-y-4 px-4 pb-4 pt-3 sm:px-0"
        style={{ paddingBottom: formPad }}
      >
        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            {t("search.filters.section.age")}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block text-[12px] text-slate-400">
              {t("search.ageMin")}
              <input
                type="number"
                inputMode="numeric"
                min={PEOPLE_SEARCH_MIN_AGE}
                max={PEOPLE_SEARCH_MAX_AGE}
                value={minInput}
                onChange={(event) => {
                  setMinInput(event.target.value);
                  setValidationError(null);
                }}
                className={FIELD_CLASS}
              />
            </label>
            <label className="block text-[12px] text-slate-400">
              {t("search.ageMax")}
              <input
                type="number"
                inputMode="numeric"
                min={PEOPLE_SEARCH_MIN_AGE}
                max={PEOPLE_SEARCH_MAX_AGE}
                value={maxInput}
                onChange={(event) => {
                  setMaxInput(event.target.value);
                  setValidationError(null);
                }}
                className={FIELD_CLASS}
              />
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            {t("search.filters.section.location")}
          </p>
          <label className="block text-[12px] text-slate-400">
            {t("search.country")}
            <select
              value={countrySlug}
              onChange={(event) => {
                setCountrySlug(event.target.value);
                setCityId("");
              }}
              disabled={loading}
              className={FIELD_CLASS}
            >
              <option value="">{t("search.allCountries")}</option>
              {catalog.countries.map((country) => (
                <option key={country.id} value={country.slug}>
                  {getCountryFlag(country.slug, country.emoji)}{" "}
                  {localizeCountryName(locale, { slug: country.slug, name: country.name })}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] text-slate-400">
            {t("search.city")}
            <select
              value={cityId}
              onChange={(event) => setCityId(event.target.value)}
              disabled={!countrySlug || loading}
              className={FIELD_CLASS}
            >
              <option value="">{t("search.allCities")}</option>
              {availableCities.map((city) => (
                <option key={city.id} value={city.id}>
                  {localizeCityName(locale, {
                    slug: city.slug,
                    name: city.name,
                    countrySlug: selectedCountry?.slug ?? null,
                  })}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            {t("search.filters.section.availability")}
          </p>
          <label className="flex h-11 items-center gap-3 rounded-[14px] border border-white/[0.06] bg-[#0c0e14] px-3">
            <span className="min-w-0 flex-1 text-[14px] text-slate-200">{t("search.onlineNow")}</span>
            <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
              <input
                type="checkbox"
                checked={onlineOnly}
                onChange={(event) => setOnlineOnly(event.target.checked)}
                className="peer sr-only"
              />
              <span className="absolute inset-0 rounded-full bg-white/10 transition peer-checked:bg-cyan-400/80" />
              <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
            </span>
          </label>
        </section>

        {localizedError || validationMessage ? (
          <div className="rounded-[14px] border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-200">
            {localizedError ?? validationMessage}
          </div>
        ) : null}

        <div className="space-y-2 pt-1">
          <button
            type="submit"
            disabled={loading || submitting}
            className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-cyan-400 text-[15px] font-semibold text-slate-950 transition active:opacity-90 disabled:opacity-50"
          >
            {t("nav.search")}
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 w-full items-center justify-center rounded-[14px] text-[13px] font-medium text-slate-400 transition hover:text-slate-200 active:opacity-80"
          >
            {t("search.resetFilters")}
          </button>
        </div>
      </form>
    </div>
  );
}
