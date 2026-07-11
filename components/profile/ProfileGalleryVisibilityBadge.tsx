"use client";

import { Lock, LockOpen, Users } from "lucide-react";
import type { ProfileGalleryVisibility } from "@/lib/profileGalleryVisibility";
import { useI18n } from "@/components/I18nProvider";

type ProfileGalleryVisibilityBadgeProps = {
  visibility: ProfileGalleryVisibility;
  className?: string;
};

export default function ProfileGalleryVisibilityBadge({
  visibility,
  className = "",
}: ProfileGalleryVisibilityBadgeProps) {
  const { t } = useI18n();

  const label =
    visibility === "everyone"
      ? t("profile.galleryVisibility.everyone")
      : visibility === "friends"
        ? t("profile.galleryVisibility.friends")
        : t("profile.galleryVisibility.onlyMe");

  const Icon = visibility === "everyone" ? LockOpen : visibility === "friends" ? Users : Lock;

  return (
    <span
      className={`pointer-events-none absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/35 bg-[#07101f]/95 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.28)] ${className}`}
      aria-hidden
      title={label}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
    </span>
  );
}
