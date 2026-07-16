"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";
import { MOBILE_SAFE_AREA_TOP, MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

export function SettingsPageHeader({
  title,
  backHref = "/profile",
}: {
  title: string;
  backHref?: string;
}) {
  const { t } = useI18n();

  return (
    <header className={`flex items-center gap-3 px-1 ${MOBILE_SAFE_AREA_TOP} ${MOBILE_WIDTH_SAFE_CLASS}`}>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium text-muted transition hover:text-white"
      >
        <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
        {t("common.back")}
      </Link>
      <h1 className="text-xl font-semibold text-white">{title}</h1>
    </header>
  );
}

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1026] divide-y divide-white/[0.06]">
        {children}
      </div>
    </section>
  );
}

type SettingsRowProps = {
  label: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  detail?: string;
  destructive?: boolean;
  disabled?: boolean;
};

export function SettingsRow({
  label,
  description,
  href,
  onClick,
  icon: Icon,
  detail,
  destructive = false,
  disabled = false,
}: SettingsRowProps) {
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-primary">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${destructive ? "text-red-300" : "text-white"}`}>{label}</p>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
        </div>
      </div>
      {detail ? <span className="shrink-0 text-xs text-muted">{detail}</span> : null}
      {href || onClick ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
      ) : null}
    </>
  );

  const className = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
    disabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/[0.03] active:bg-white/[0.05]"
  }`;

  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-white/20 bg-[#050816] text-primary focus:ring-primary/30 disabled:opacity-50"
      />
    </label>
  );
}

export function SettingsSelectRow({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-white">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-white/10 bg-[#050816] px-3 py-2 text-sm text-white outline-none focus:border-primary/45 disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SettingsInfoRow({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-sm font-medium text-white">{label}</p>
      {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}

export function SettingsThemePicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; color: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3 px-4 py-3.5">
      <p className="text-sm font-medium text-white">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-primary/60 bg-primary/10 ring-1 ring-primary/35"
                  : "border-white/10 bg-[#050816] hover:border-white/20"
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/15"
                style={{ backgroundColor: option.color }}
                aria-hidden
              />
              <span className={`text-sm font-medium ${selected ? "text-white" : "text-slate-300"}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const settingsSuccessMessageClass =
  "rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-white";

export const settingsFieldClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none transition placeholder:text-muted focus:border-primary/45 focus:ring-2 focus:ring-primary/15";

export const settingsPrimaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";

export const settingsDangerButtonClass =
  "inline-flex w-full items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45";
