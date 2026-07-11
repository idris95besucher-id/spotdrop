"use client";

import { MoreVertical, Play } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { getProfilePostMedia, type ProfileContentPost } from "@/lib/profileContent";
import { isProfileGalleryVideo } from "@/lib/profileGallery";

type ProfileGalleryGridProps = {
  items: ProfileContentPost[];
  loading?: boolean;
  isOwner?: boolean;
  onSelectItem: (index: number) => void;
  onOpenItemMenu?: (index: number) => void;
};

export default function ProfileGalleryGrid({
  items,
  loading = false,
  isOwner = false,
  onSelectItem,
  onOpenItemMenu,
}: ProfileGalleryGridProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className={`grid w-full grid-cols-3 gap-0.5 ${MOBILE_WIDTH_SAFE_CLASS}`}>
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={`gallery-skeleton-${index}`} className="aspect-square animate-pulse bg-slate-900" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`px-6 py-16 text-center ${MOBILE_WIDTH_SAFE_CLASS}`}>
        <p className="text-sm font-medium text-slate-300">{t("profile.galleryEmpty")}</p>
        <p className="mt-1.5 text-xs text-slate-500">{t("profile.galleryEmptyHint")}</p>
      </div>
    );
  }

  return (
    <div className={`grid w-full grid-cols-3 gap-0.5 ${MOBILE_WIDTH_SAFE_CLASS}`}>
      {items.map((post, index) => {
        const { mediaUrl } = getProfilePostMedia(post);
        const isVideo = isProfileGalleryVideo(post);
        const previewUrl =
          (isVideo
            ? post.video_cover_url ?? post.thumbnail_url ?? post.image_url
            : post.image_url ?? post.thumbnail_url ?? mediaUrl) ?? mediaUrl;

        return (
          <div key={post.id} className="relative aspect-square overflow-hidden bg-slate-950">
            <button
              type="button"
              onClick={() => onSelectItem(index)}
              className="relative h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
              aria-label={isVideo ? t("profile.galleryOpenVideo") : t("profile.galleryOpenPhoto")}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
                  {isVideo ? t("profile.galleryVideoLabel") : t("profile.galleryPhotoLabel")}
                </span>
              )}

              {isVideo ? (
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15">
                  <Play className="h-3 w-3 fill-current" aria-hidden />
                </span>
              ) : null}
            </button>

            {isOwner && onOpenItemMenu ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenItemMenu(index);
                }}
                className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-black/70"
                aria-label={t("profile.galleryItemActions")}
              >
                <MoreVertical className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
