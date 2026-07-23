"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { authInputClass, authLabelClass } from "@/components/auth/authStyles";

export type AuthSearchableSelectOption = {
  value: string;
  label: string;
  leading?: string;
  searchText?: string;
};

type AuthSearchableSelectProps = {
  id: string;
  label: string;
  value: string;
  options: AuthSearchableSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
};

export default function AuthSearchableSelect({
  id,
  label,
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled = false,
  required = false,
  onChange,
}: AuthSearchableSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }

    return options.filter((option) => {
      const haystack = `${option.label} ${option.searchText ?? ""} ${option.value}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setQuery("");
    }
  }, [disabled, open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <span className={authLabelClass}>
        {label} {required ? <span className="text-cyan-400/80">*</span> : null}
      </span>

      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((current) => !current);
          setQuery("");
        }}
        className={`${authInputClass} flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-55`}
      >
        {selected?.leading ? (
          <span className="shrink-0 text-base leading-none" aria-hidden>
            {selected.leading}
          </span>
        ) : null}
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-white" : "text-muted"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/50">
          <label className="relative block border-b border-white/10 px-3 py-2.5">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="box-border w-full min-w-0 rounded-lg border border-white/10 bg-card py-2 pl-9 pr-3 text-[15px] text-white outline-none placeholder:text-muted focus:border-primary/45"
            />
          </label>

          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={id}
            className="max-h-48 overflow-y-auto overscroll-contain py-1 [-webkit-overflow-scrolling:touch]"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted">{emptyMessage}</li>
            ) : (
              filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <li key={option.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] transition hover:bg-white/5 ${
                        isSelected ? "bg-primary/15 text-white" : "text-white"
                      }`}
                    >
                      {option.leading ? (
                        <span className="shrink-0 text-base leading-none" aria-hidden>
                          {option.leading}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
