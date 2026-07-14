"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Play } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import {
  getProfilePostMedia,
  getSpotDisplayLabel,
  type ProfileContentPost,
} from "@/lib/profileContent";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";
import { profilePostsToViewerItems, type ViewerPostAuthor } from "@/lib/postViewer";
import {
  loadUserSavedSpots,
  SPOT_SAVE_CHANGED_EVENT,
  type SpotSaveChangedDetail,
} from "@/lib/savedSpots";

const PROFILE_GRID_CLASS = `grid w-full min-w-0 max-w-full grid-cols-3 gap-px ${MOBILE_WIDTH_SAFE_CLASS}`;

type ProfileSavedTabProps = {
  userId: string;
  viewerAuthor?: ViewerPostAuthor | null;
};

export default function ProfileSavedTab({ userId, viewerAuthor = null }: ProfileSavedTabProps) {
  const { t } = useI18n();
  const [posts, setPosts] = useState<ProfileContentPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await loadUserSavedSpots(userId);
    setPosts(result.posts);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleSaveChanged = (event: Event) => {
      const detail = (event as CustomEvent<SpotSaveChangedDetail>).detail;

      if (!detail?.postId) {
        return;
      }

      if (!detail.saved) {
        setPosts((current) => current.filter((post) => !postIdsEqual(post.id, detail.postId)));
        return;
      }

      void load();
    };

    window.addEventListener(SPOT_SAVE_CHANGED_EVENT, handleSaveChanged);

    return () => {
      window.removeEventListener(SPOT_SAVE_CHANGED_EVENT, handleSaveChanged);
    };
  }, [load]);

  const activeItems = useMemo(
    () => posts.filter((post) => Boolean(normalizePostId(post.id))),
    [posts]
  );

  const viewerItems = useMemo(() => {
    if (!viewerAuthor) {
      return [];
    }

    return profilePostsToViewerItems(activeItems, viewerAuthor);
  }, [activeItems, viewerAuthor]);

  if (loading) {
    return (
      <div className={PROFILE_GRID_CLASS}>
        {Array.from({ length: 9 }).map((_, index) => (
          <div
            key={`saved-grid-loading-${index}`}
            className="aspect-square animate-pulse bg-slate-900/90"
          />
        ))}
      </div>
    );
  }

  if (activeItems.length === 0) {
    return (
      <div
        className={`profile-header-enter flex min-h-[42vh] flex-col items-center justify-center px-8 text-center ${MOBILE_WIDTH_SAFE_CLASS}`}
      >
        <Bookmark className="h-9 w-9 text-slate-500" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 text-[15px] font-semibold text-white">{t("profile.noSavedSpotsYet")}</p>
        <p className="mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-muted">
          {t("profile.noSavedSpotsYetSubtitle")}
        </p>
      </div>
    );
  }

  return (
    <div className={PROFILE_GRID_CLASS}>
      {activeItems.map((post, gridIndex) => {
        const { mediaUrl, mediaType } = getProfilePostMedia(post);
        const spotTitle = getSpotDisplayLabel(post);
        const clickedSpot = viewerItems[gridIndex];
        const isVideo = mediaType === "video" || Boolean(post.video_url?.trim());

        return (
          <article
            key={post.id}
            className="relative aspect-square min-w-0 overflow-hidden bg-slate-950"
          >
            {mediaUrl ? (
              <PostMediaLink
                postId={post.id}
                className="block h-full w-full origin-center transition-transform duration-150 ease-out active:scale-[0.97]"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                viewerMode="profile-feed"
              >
                <div className="h-full w-full animate-[profile-grid-fade-in_320ms_ease-out]">
                  <PostCardMedia
                    post={post}
                    postId={post.id}
                    gridPreview
                    className="h-full w-full"
                    imageClassName="h-full w-full object-cover"
                    fallbackLabel={spotTitle || post.content?.trim() || t("profile.spotFallback")}
                  />
                </div>
              </PostMediaLink>
            ) : (
              <PostMediaLink
                postId={post.id}
                className="flex h-full w-full origin-center items-center justify-center bg-slate-900 px-2 text-center text-xs leading-snug text-slate-300 transition-transform duration-150 ease-out active:scale-[0.97]"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                viewerMode="profile-feed"
              >
                <span className="line-clamp-4">
                  {spotTitle || post.content?.trim() || t("profile.spotFallback")}
                </span>
              </PostMediaLink>
            )}

            {isVideo ? (
              <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                <Play className="h-3.5 w-3.5 fill-white text-white" strokeWidth={0} aria-hidden />
              </span>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
