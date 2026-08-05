"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileAvatarActionSheet from "@/components/ProfileAvatarActionSheet";
import ProfilePhotoViewer from "@/components/ProfilePhotoViewer";
import { useI18n } from "@/components/I18nProvider";
import { normalizeAvatarUrl } from "@/lib/avatarUrl";
import { profileGalleryHref } from "@/lib/profileGalleryVisibility";

type ProfileAvatarProfileTriggerProps = {
  userId: string;
  /** Current viewer — needed so own Private Profile opens `/profile/gallery` (owner mode). */
  viewerUserId?: string | null;
  avatarUrl?: string | null;
  sizeClassName?: string;
  iconClassName?: string;
  className?: string;
};

/**
 * Tappable profile avatar that opens the avatar action sheet.
 * Intended for the large avatar on the live `/user?id=...` profile header.
 */
export default function ProfileAvatarProfileTrigger({
  userId,
  viewerUserId = null,
  avatarUrl,
  sizeClassName = "h-10 w-10",
  iconClassName = "h-4 w-4",
  className = "",
}: ProfileAvatarProfileTriggerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const normalizedAvatar = normalizeAvatarUrl(avatarUrl);
  const hasAvatar = Boolean(normalizedAvatar);

  const handleOpenPrivateProfile = useCallback(() => {
    setMenuOpen(false);
    router.push(profileGalleryHref(userId, viewerUserId));
  }, [router, userId, viewerUserId]);

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
        onOpenPrivateProfile={handleOpenPrivateProfile}
      />

      {photoOpen && normalizedAvatar ? (
        <ProfilePhotoViewer src={normalizedAvatar} onClose={() => setPhotoOpen(false)} />
      ) : null}
    </>
  );
}
