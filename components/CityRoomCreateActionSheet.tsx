"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Camera, MapPin, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/messages";

type ActiveActionId = "photo" | "spot";

type CityRoomCreateActionSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhoto: () => void;
  onSelectSpot: () => void;
  disabled?: boolean;
};

type MenuItem = {
  id: ActiveActionId;
  labelKey: TranslationKey;
  icon: LucideIcon;
  iconClass: string;
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: "photo",
    labelKey: "rooms.create.addPhoto",
    icon: Camera,
    iconClass: "text-cyan-300",
  },
  {
    id: "spot",
    labelKey: "rooms.create.shareSpot",
    icon: MapPin,
    iconClass: "text-emerald-300",
  },
];

export default function CityRoomCreateActionSheet({
  isOpen,
  onClose,
  onSelectPhoto,
  onSelectSpot,
  disabled = false,
}: CityRoomCreateActionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  const menuItems = useMemo(
    () =>
      MENU_ITEMS.map((item) => ({
        ...item,
        label: t(item.labelKey),
      })),
    [t]
  );

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

  const handleSelect = (item: (typeof menuItems)[number]) => {
    if (disabled) {
      return;
    }

    onClose();

    if (item.id === "photo") {
      onSelectPhoto();
      return;
    }

    onSelectSpot();
  };

  const sheet = (
    <div className="fixed inset-0 z-[125] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-room-create-title"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl shadow-black/50 sm:rounded-3xl"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 id="city-room-create-title" className="text-base font-semibold text-white">
            {t("rooms.create.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-1 p-2">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(item)}
                className="flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition hover:bg-white/5 active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5">
                  <Icon className={`h-5 w-5 ${item.iconClass}`} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-sm font-semibold text-white">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
