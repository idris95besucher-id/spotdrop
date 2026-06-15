"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, X } from "lucide-react";

export type ProfileMenuItem = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  badge?: string | number;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
};

type ProfileMenuSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  items: ProfileMenuItem[];
  title?: string;
};

function MenuRow({
  item,
  onClose,
}: {
  item: ProfileMenuItem;
  onClose: () => void;
}) {
  const Icon = item.icon;
  const content = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          item.destructive ? "bg-red-500/10 text-red-300" : "bg-white/5 text-primary"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-sm font-semibold ${item.destructive ? "text-red-200" : "text-white"}`}>
          {item.label}
        </span>
        {item.description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{item.description}</span>
        ) : null}
      </span>
      {item.badge != null && item.badge !== "" ? (
        <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
          {item.badge}
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      )}
    </>
  );

  const rowClass =
    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/5 active:bg-white/10";

  if (item.href) {
    return (
      <Link href={item.href} onClick={onClose} className={rowClass}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        item.onClick?.();
        onClose();
      }}
      className={rowClass}
    >
      {content}
    </button>
  );
}

export default function ProfileMenuSheet({
  isOpen,
  onClose,
  items,
  title,
}: ProfileMenuSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const sheetTitle = title ?? t("menu.title");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !mounted) {
    return null;
  }

  const sheet = (
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-menu-title"
        className="relative z-10 flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="profile-menu-title" className="text-base font-semibold text-white">
            {sheetTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="space-y-1 overflow-y-auto p-2" aria-label="Profile menu">
          {items.map((item) => (
            <MenuRow key={item.id} item={item} onClose={onClose} />
          ))}
        </nav>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
