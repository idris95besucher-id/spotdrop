export type PeopleSearchMode = "username" | "filters";

export type PeopleUsernameSearchState = {
  input: string;
  appliedQuery: string;
  hasSearched: boolean;
};

export type PeopleFiltersSearchState = {
  minInput: string;
  maxInput: string;
  countrySlug: string;
  cityId: string;
  onlineOnly: boolean;
  appliedMin: number | null;
  appliedMax: number | null;
  appliedCountrySlug: string;
  appliedCityId: string;
  appliedOnlineOnly: boolean;
  hasSearched: boolean;
};

const STORAGE_PREFIX = "spotdrop:people-search:";

function storageKey(mode: PeopleSearchMode, suffix: string) {
  return `${STORAGE_PREFIX}${mode}:${suffix}`;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function loadUsernameSearchState(): PeopleUsernameSearchState {
  return (
    readJson<PeopleUsernameSearchState>(storageKey("username", "state")) ?? {
      input: "",
      appliedQuery: "",
      hasSearched: false,
    }
  );
}

export function saveUsernameSearchState(state: PeopleUsernameSearchState) {
  writeJson(storageKey("username", "state"), state);
}

export function loadFiltersSearchState(): PeopleFiltersSearchState {
  return (
    readJson<PeopleFiltersSearchState>(storageKey("filters", "state")) ?? {
      minInput: "18",
      maxInput: "99",
      countrySlug: "",
      cityId: "",
      onlineOnly: false,
      appliedMin: null,
      appliedMax: null,
      appliedCountrySlug: "",
      appliedCityId: "",
      appliedOnlineOnly: false,
      hasSearched: false,
    }
  );
}

export function saveFiltersSearchState(state: PeopleFiltersSearchState) {
  writeJson(storageKey("filters", "state"), state);
}

export function loadPeopleSearchScroll(mode: PeopleSearchMode) {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = sessionStorage.getItem(storageKey(mode, "scroll"));
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function savePeopleSearchScroll(mode: PeopleSearchMode, scrollTop: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(storageKey(mode, "scroll"), String(Math.max(0, Math.round(scrollTop))));
  } catch {
    // Ignore.
  }
}
