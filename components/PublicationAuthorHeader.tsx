"use client";

import Link from "next/link";
import OwnContentMenu from "@/components/OwnContentMenu";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useI18n } from "@/components/I18nProvider";

type PublicationAuthorHeaderProps = {
  authorUserId: string;
  authorUsername: string;
  avatarUrl?: string | null;
  viewerUserId: string | null;
  onEdit?: () => void;
  /** Omit to keep this row avatar/username only — e.g. when the three-dot menu is rendered elsewhere. */
  onDelete?: () => Promise<{ ok: boolean; error: string | null }>;
  onDeleted?: () => void;
  className?: string;
  menuTriggerClassName?: string;
};

/**
 * Avatar + username row with optional owner three-dot menu on the same line.
 */
export default function PublicationAuthorHeader({
  authorUserId,
  authorUsername,
  avatarUrl,
  viewerUserId,
  onEdit,
  onDelete,
  onDeleted,
  className = "",
  menuTriggerClassName = "",
}: PublicationAuthorHeaderProps) {
  const { t } = useI18n();
  const isOwner = Boolean(viewerUserId && authorUserId === viewerUserId && onDelete);

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <Link
        href={`/user?id=${encodeURIComponent(authorUserId)}`}
        className="flex min-w-0 flex-1 items-center gap-2 transition hover:opacity-90"
      >
        <ProfileAvatar
          src={avatarUrl}
          sizeClassName="h-8 w-8"
          iconClassName="h-4 w-4"
          className="border border-white/15"
        />
        <span className="truncate text-sm font-semibold text-white">{authorUsername}</span>
      </Link>

      {isOwner && onDelete ? (
        <div className="relative z-40 shrink-0" onClick={(event) => event.stopPropagation()}>
          <OwnContentMenu
            triggerClassName={menuTriggerClassName}
            deleteMenuLabel={t("content.deletePublication")}
            editMenuLabel={t("content.editPublication")}
            confirmTitle={t("content.deletePublicationTitle")}
            confirmBody={t("content.deletePublicationBody")}
            deletedToast={t("content.spotDeleted")}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleted={onDeleted}
          />
        </div>
      ) : null}
    </div>
  );
}
