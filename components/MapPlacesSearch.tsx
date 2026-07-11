"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { searchMapPlaces, type MapPlaceSearchResult } from "@/lib/mapPlacesSearch";
import { setMapSearchKeyboardNavHidden } from "@/lib/mapSearchKeyboardNav";

type MapPlacesSearchProps = {
  onSelectPlace: (place: MapPlaceSearchResult) => void;
  disabled?: boolean;
};

const KEYBOARD_OPEN_THRESHOLD_PX = 80;

function readKeyboardOpen() {
  if (typeof window === "undefined") {
    return false;
  }

  const viewport = window.visualViewport;

  if (!viewport) {
    return false;
  }

  return window.innerHeight - viewport.height - viewport.offsetTop > KEYBOARD_OPEN_THRESHOLD_PX;
}

function readResultsMaxHeightPx() {
  if (typeof window === "undefined") {
    return 288;
  }

  const viewport = window.visualViewport;
  const visibleHeight = viewport?.height ?? window.innerHeight;
  // Keep results under the search field and above the keyboard / home indicator.
  return Math.max(140, Math.min(288, Math.round(visibleHeight * 0.42)));
}

export default function MapPlacesSearch({ onSelectPlace, disabled = false }: MapPlacesSearchProps) {
  const { t } = useI18n();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapPlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [resultsMaxHeightPx, setResultsMaxHeightPx] = useState(288);
  const requestIdRef = useRef(0);
  /** While set, skip autocomplete for this exact query (post-selection). */
  const selectionQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (selectionQueryRef.current !== null && trimmed === selectionQueryRef.current.trim()) {
      setLoading(false);
      return;
    }

    selectionQueryRef.current = null;

    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      setOpen(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      void searchMapPlaces(trimmed, 12).then((response) => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setResults(response.results);
        setError(response.error);
        setLoading(false);
        setOpen(true);
      });
    }, 320);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const syncViewport = () => {
      setKeyboardOpen(readKeyboardOpen());
      setResultsMaxHeightPx(readResultsMaxHeightPx());
    };

    syncViewport();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);

    let showHandle: { remove: () => Promise<void> } | undefined;
    let hideHandle: { remove: () => Promise<void> } | undefined;

    if (Capacitor.isNativePlatform()) {
      void Keyboard.addListener("keyboardWillShow", () => {
        setKeyboardOpen(true);
        setResultsMaxHeightPx(readResultsMaxHeightPx());
      }).then((handle) => {
        showHandle = handle;
      });

      void Keyboard.addListener("keyboardWillHide", () => {
        setKeyboardOpen(false);
        setResultsMaxHeightPx(readResultsMaxHeightPx());
      }).then((handle) => {
        hideHandle = handle;
      });
    }

    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      void showHandle?.remove();
      void hideHandle?.remove();
    };
  }, []);

  useEffect(() => {
    const hideNav = focused || keyboardOpen;
    setMapSearchKeyboardNavHidden(hideNav);

    return () => {
      setMapSearchKeyboardNavHidden(false);
    };
  }, [focused, keyboardOpen]);

  const clearQuery = () => {
    requestIdRef.current += 1;
    selectionQueryRef.current = null;
    setQuery("");
    setResults([]);
    setError(null);
    setOpen(false);
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleSelect = (place: MapPlaceSearchResult) => {
    // Invalidate in-flight searches and pin this label so the effect does not
    // reopen results (which left stale rows like "Bern, Switzerland" under the field).
    requestIdRef.current += 1;
    selectionQueryRef.current = place.label;
    setQuery(place.label);
    setResults([]);
    setError(null);
    setOpen(false);
    setLoading(false);
    onSelectPlace(place);
    inputRef.current?.blur();
  };

  // Show the panel only while actively browsing results — never after a selection.
  const resultsVisible = open && query.trim().length >= 2;

  return (
    <div className="pointer-events-auto relative w-full max-w-lg">
      <label className="relative flex items-center">
        <Search
          className="pointer-events-none absolute left-3.5 h-4 w-4 shrink-0 text-slate-400"
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          role="combobox"
          aria-expanded={resultsVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={t("map.placesSearchPlaceholder")}
          onChange={(event) => {
            selectionQueryRef.current = null;
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            if (query.trim().length >= 2 && results.length > 0) {
              setOpen(true);
            }
          }}
          onBlur={() => {
            setFocused(false);
          }}
          className="w-full rounded-2xl border border-white/12 bg-[#0B1026]/92 py-3 pl-10 pr-10 text-sm text-white shadow-lg outline-none backdrop-blur-md placeholder:text-slate-500 focus:border-primary/45"
        />
        {loading ? (
          <Loader2
            className="pointer-events-none absolute right-3.5 h-4 w-4 animate-spin text-slate-400"
            aria-hidden
          />
        ) : query ? (
          <button
            type="button"
            onClick={clearQuery}
            className="absolute right-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </label>

      {resultsVisible ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 overflow-y-auto rounded-2xl border border-white/12 bg-[#0B1026]/96 py-1 shadow-2xl backdrop-blur-md"
          style={{ maxHeight: resultsMaxHeightPx }}
        >
          {loading && results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t("map.placesSearching")}</p>
          ) : error ? (
            <p className="px-4 py-6 text-center text-sm text-red-200">
              {localizeUserMessage(t, error) ?? t("map.placesSearchError")}
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t("map.placesSearchEmpty")}</p>
          ) : (
            <ul>
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    role="option"
                    onMouseDown={(event) => {
                      // Prevent input blur from racing the click on iOS.
                      event.preventDefault();
                    }}
                    onClick={() => handleSelect(place)}
                    className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-white/5 active:bg-white/8"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{place.name}</span>
                      {place.subtitle ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-400">{place.subtitle}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
