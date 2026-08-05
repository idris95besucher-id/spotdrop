"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileAvatarActionSheet from "@/components/ProfileAvatarActionSheet";
import ProfilePhotoViewer from "@/components/ProfilePhotoViewer";
import { useI18n } from "@/components/I18nProvider";
import { normalizeAvatarUrl } from "@/lib/avatarUrl";

type ProfileAvatarProfileTriggerProps = {
  userId: string;
  avatarUrl?: string | null;
  sizeClassName?: string;
  iconClassName?: string;
  className?: string;
  /**
   * When set, used instead of default `/user?id=` navigation for "Open profile"
   * (e.g. suspend fullscreen Spot viewer before pushing the profile route).
   */
  onOpenProfile?: () => void;
};

/**
 * Tappable profile avatar that opens the avatar action sheet instead of navigating immediately.
 */
export default function ProfileAvatarProfileTrigger({
  userId,
  avatarUrl,
  sizeClassName = "h-10 w-10",
  iconClassName = "h-4 w-4",
  className = "",
  onOpenProfile,
}: ProfileAvatarProfileTriggerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const normalizedAvatar = normalizeAvatarUrl(avatarUrl);
  const hasAvatar = Boolean(normalizedAvatar);

  const handleOpenProfile = useCallback(() => {
    setMenuOpen(false);

    if (onOpenProfile) {
      onOpenProfile();
      return;
    }

    router.push(`/user?id=${encodeURIComponent(userId)}`);
  }, [onOpenProfile, router, userId]);

  const handleAvatarClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleAvatarClick}
        className="shrink-0 rounded-full transition hover:opacity-90 active:opacity-80"
        aria-label={t("profileAvatar.openMenu")}
      >
        <ProfileAvatar
          src={avatarUrl}
          sizeClassName={sizeClassName}
          iconClassName={iconClassName}
          className={className}
        />
      </button>

      <ProfileAvatarActionSheet
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        hasAvatar={hasAvatar}
        onViewPhoto={() => {
          if (!hasAvatar || !normalizedAvatar) {
            return;
          }

          setPhotoOpen(true);
        }}
        onOpenProfile={handleOpenProfile}
      />

      {photoOpen && normalizedAvatar ? (
        <ProfilePhotoViewer src={normalizedAvatar} onClose={() => setPhotoOpen(false)} />
      ) : null}
    </>
  );
}
