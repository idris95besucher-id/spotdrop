"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileGalleryVisibilityBadge from "@/components/profile/ProfileGalleryVisibilityBadge";
import { normalizeAvatarUrl } from "@/lib/avatarUrl";
import {
  hasSeenProfileGalleryAvatarPulse,
  markProfileGalleryAvatarPulseSeen,
} from "@/lib/profileGalleryAvatarHint";
import {
  profileGalleryHref,
  type ProfileGalleryVisibility,
} from "@/lib/profileGalleryVisibility";

type ProfileGalleryAvatarLinkProps = {
  avatarUrl?: string | null;
  ownerUserId: string;
  viewerUserId: string | null;
  visibility?: ProfileGalleryVisibility;
  variant?: "compact" | "large";
  showLabel?: boolean;
};

export default function ProfileGalleryAvatarLink({
  avatarUrl,
  ownerUserId,
  viewerUserId,
  visibility = "everyone",
  variant = "compact",
  showLabel = variant === "compact",
}: ProfileGalleryAvatarLinkProps) {
  const { t } = useI18n();
  const [ringPulsing, setRingPulsing] = useState(false);
  const isOwner = Boolean(viewerUserId && viewerUserId === ownerUserId);
  const href = profileGalleryHref(ownerUserId, viewerUserId);
  const safeAvatarUrl = normalizeAvatarUrl(avatarUrl);

  const avatarSizeClass =
    variant === "large"
      ? "h-24 w-24 sm:h-32 sm:w-32"
      : "h-14 w-14";

  const placeholderIconClass = variant === "large" ? "h-11 w-11 sm:h-12 sm:w-12" : "h-6 w-6";

  useEffect(() => {
    if (!isOwner) {
      return;
    }

    setRingPulsing(!hasSeenProfileGalleryAvatarPulse());
  }, [isOwner]);

  const handlePulseEnd = () => {
    if (!ringPulsing) {
      return;
    }

    markProfileGalleryAvatarPulseSeen();
    setRingPulsing(false);
  };

  const avatarBlock = (
    <span className="relative">
      <span
        className={`profile-gallery-avatar-ring block rounded-full p-[2px] transition duration-150 group-active:scale-[0.98] group-active:opacity-90 ${
          isOwner && ringPulsing ? "profile-gallery-avatar-ring--pulse" : ""
        }`}
        onAnimationEnd={isOwner ? handlePulseEnd : undefined}
      >
        <ProfileAvatar
          key={safeAvatarUrl ?? "no-avatar"}
          src={safeAvatarUrl}
          sizeClassName={avatarSizeClass}
          iconClassName={placeholderIconClass}
          className="border border-white/10 shadow-xl shadow-black/50"
        />
      </span>
      <ProfileGalleryVisibilityBadge
        visibility={visibility}
        className={variant === "large" ? "h-6 w-6 -bottom-0.5 -right-0.5" : ""}
      />
    </span>
  );

  // Tapping the avatar only ever navigates to the (read-only-on-arrival) gallery/Private
  // Profile screen — it never opens a photo picker, crop screen, or editing action directly.
  // Changing the profile photo itself is only reachable via Edit profile -> Change photo.
  return (
    <Link
      href={href}
      className={`group flex flex-col items-center gap-1 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
        variant === "large" ? "mx-auto" : ""
      }`}
      aria-label={t("profile.openGallery")}
    >
      {avatarBlock}
      {showLabel ? (
        <span className="max-w-[5.5rem] text-center text-[10px] font-medium leading-tight tracking-[0.02em] text-cyan-300/75 transition group-hover:text-cyan-200/90">
          {t("profile.galleryLabel")}
        </span>
      ) : null}
    </Link>
  );
}
