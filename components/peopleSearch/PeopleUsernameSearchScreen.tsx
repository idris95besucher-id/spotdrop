"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Search as SearchIcon } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import PeopleSearchResults from "@/components/peopleSearch/PeopleSearchResults";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { filterPeopleByUsername } from "@/lib/peopleSearch";
import {
  loadUsernameSearchState,
  saveUsernameSearchState,
} from "@/lib/peopleSearchSession";
import { usePeopleSearchCatalog } from "@/lib/usePeopleSearchCatalog";
import { composerPaddingBottom, useKeyboard } from "@/lib/keyboardSystem";

export default function PeopleUsernameSearchScreen() {
  const { t } = useI18n();
  const { catalog, loading, error } = usePeopleSearchCatalog();
  const { isKeyboardOpen } = useKeyboard();
  const [input, setInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadUsernameSearchState();
    setInput(saved.input);
    setAppliedQuery(saved.appliedQuery);
    setHasSearched(saved.hasSearched);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    saveUsernameSearchState({ input, appliedQuery, hasSearched });
  }, [hydrated, input, appliedQuery, hasSearched]);

  const results = useMemo(() => {
    if (!hasSearched || !appliedQuery) {
      return [];
    }

    return filterPeopleByUsername(catalog.profiles, appliedQuery);
  }, [catalog.profiles, hasSearched, appliedQuery]);

  const runSearch = (raw: string) => {
    const query = raw.trim();
    setSearching(true);
    setAppliedQuery("");
    setHasSearched(true);

    window.setTimeout(() => {
      setAppliedQuery(query);
      setSearching(false);
    }, 0);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(input);
  };

  const localizedError = localizeUserMessage(t, error);
  const formPad = composerPaddingBottom("fullscreen", isKeyboardOpen);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        className="shrink-0 border-b border-white/[0.06] px-4 pb-4 pt-3 sm:px-0"
        style={{ paddingBottom: formPad }}
      >
        <label htmlFor="people-username-search" className="block text-[12px] text-slate-400">
          {t("search.usernamePlaceholder")}
          <div className="mt-1.5 flex gap-2">
            <input
              id="people-username-search"
              name="people-username-search"
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("search.usernamePlaceholder")}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 min-w-0 flex-1 rounded-[14px] border border-white/[0.06] bg-[#0c0e14] px-3 text-[15px] text-white outline-none transition focus:border-white/15 focus:bg-[#10131a]"
            />
            <button
              type="submit"
              disabled={loading || searching || !input.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[14px] bg-cyan-400 px-4 text-[14px] font-semibold text-slate-950 transition active:opacity-90 disabled:opacity-50"
            >
              <SearchIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("nav.search")}
            </button>
          </div>
        </label>
      </form>

      {localizedError ? (
        <div className="mx-4 mt-3 rounded-[14px] border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-200 sm:mx-0">
          {localizedError}
        </div>
      ) : null}

      {!hasSearched && !searching ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-slate-500">
            <SearchIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="mt-4 max-w-[240px] text-[13px] leading-relaxed text-slate-500">
            {t("search.username.helper")}
          </p>
        </div>
      ) : (
        <PeopleSearchResults
          mode="username"
          profiles={results}
          countries={catalog.countries}
          cities={catalog.cities}
          searching={loading || searching}
          showEmpty={hasSearched && !searching && !loading}
          emptyTitle={t("search.username.emptyTitle")}
          emptyBody={t("search.username.emptyBody")}
        />
      )}
    </div>
  );
}
