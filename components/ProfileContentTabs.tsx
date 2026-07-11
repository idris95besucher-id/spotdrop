"use client";

import { useMemo, type ReactNode } from "react";
import { Bookmark, LayoutGrid, Play } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import OwnContentMenu from "@/components/OwnContentMenu";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { deleteOwnedPost } from "@/lib/deleteContent";
import {
  getProfilePostMedia,
  getSpotDisplayLabel,
  type ProfileContentPost,
} from "@/lib/profileContent";
import { normalizePostId } from "@/lib/postIds";
import { profilePostsToViewerItems, type ViewerPostAuthor } from "@/lib/postViewer";

/** Profile main tabs: Spots/Posts (public) and Collections/Saved. Gallery is separate. */
export type ProfileContentTab = "spots" | "collections" | "posts";

const PROFILE_GRID_GAP_CLASS = "gap-px";
const PROFILE_GRID_CLASS = `grid w-full min-w-0 max-w-full grid-cols-3 ${PROFILE_GRID_GAP_CLASS} ${MOBILE_WIDTH_SAFE_CLASS}`;

type ProfileContentTabBarProps = {
  activeTab: Exclude<ProfileContentTab, "posts">;
  onTabChange: (tab: Exclude<ProfileContentTab, "posts">) => void;
  compact?: boolean;
};

export function ProfileContentTabBar({ activeTab, onTabChange, compact = false }: ProfileContentTabBarProps) {
  const { t } = useI18n();
  const rowPad = compact ? "py-2.5" : "py-3";
  const indicatorOffset = activeTab === "collections" ? "50%" : "0%";

  return (
    <div
      role="tablist"
      className={`relative grid w-full min-w-0 max-w-full grid-cols-2 border-b border-white/10 bg-card ${MOBILE_WIDTH_SAFE_CLASS}`}
    >
      <button
        type="button"
        role="tab"
        onClick={() => onTabChange("spots")}
        aria-label={t("profile.spots")}
        aria-selected={activeTab === "spots"}
        className={`flex ${rowPad} items-center justify-center transition-colors duration-200 ${
          activeTab === "spots" ? "text-primary" : "text-muted hover:text-slate-300"
        }`}
      >
        <LayoutGrid
          className="h-[22px] w-[22px]"
          strokeWidth={activeTab === "spots" ? 2.25 : 1.75}
          aria-hidden
        />
      </button>
      <button
        type="button"
        role="tab"
        onClick={() => onTabChange("collections")}
        aria-label={t("profile.collections")}
        aria-selected={activeTab === "collections"}
        className={`flex ${rowPad} items-center justify-center transition-colors duration-200 ${
          activeTab === "collections" ? "text-primary" : "text-muted hover:text-slate-300"
        }`}
      >
        <Bookmark
          className="h-[22px] w-[22px]"
          strokeWidth={activeTab === "collections" ? 2.25 : 1.75}
          aria-hidden
        />
      </button>

      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-[1.5px] w-1/2 bg-primary transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: `translate3d(${indicatorOffset}, 0, 0)` }}
      />
    </div>
  );
}

type ProfileContentGridPanelProps = {
  activeTab: ProfileContentTab;
  personalPosts: ProfileContentPost[];
  spotPosts: ProfileContentPost[];
  loading?: boolean;
  emptyPostsMessage?: string;
  emptySpotsMessage?: string;
  viewerUserId?: string | null;
  onPostDeleted?: (postId: string) => void;
  viewerAuthor?: ViewerPostAuthor | null;
  collectionsPanel?: ReactNode;
  compact?: boolean;
};

export function ProfileContentGridPanel({
  activeTab,
  personalPosts,
  spotPosts,
  loading = false,
  emptyPostsMessage,
  emptySpotsMessage,
  viewerUserId = null,
  onPostDeleted,
  viewerAuthor = null,
  collectionsPanel = null,
  compact: _compact = false,
}: ProfileContentGridPanelProps) {
  const { t } = useI18n();
  const activeItems = (activeTab === "posts" ? personalPosts : activeTab === "spots" ? spotPosts : []).filter(
    (post) => Boolean(normalizePostId(post.id))
  );

  const viewerItems = useMemo(() => {
    if (!viewerAuthor || activeTab === "collections") {
      return [];
    }

    return profilePostsToViewerItems(activeItems, viewerAuthor);
  }, [activeItems, activeTab, viewerAuthor]);

  if (activeTab === "collections") {
    return <div className={MOBILE_WIDTH_SAFE_CLASS}>{collectionsPanel}</div>;
  }

  if (loading) {
    return (
      <div className={PROFILE_GRID_CLASS}>
        {Array.from({ length: 9 }).map((_, index) => (
          <div
            key={`profile-grid-loading-${index}`}
            className="aspect-square animate-pulse bg-slate-900/90"
          />
        ))}
      </div>
    );
  }

  if (activeItems.length === 0) {
    const emptyTitle =
      activeTab === "posts"
        ? (emptyPostsMessage ?? t("profile.noPostsYet"))
        : (emptySpotsMessage ?? t("profile.noPostsYet"));

    return (
      <div
        className={`profile-header-enter flex min-h-[42vh] flex-col items-center justify-center px-8 text-center ${MOBILE_WIDTH_SAFE_CLASS}`}
      >
        <LayoutGrid className="h-9 w-9 text-slate-500" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 text-[15px] font-semibold text-white">{emptyTitle}</p>
        <p className="mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-muted">
          {t("profile.noPostsYetSubtitle")}
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
        const isOwner = Boolean(viewerUserId && post.user_id === viewerUserId);
        const isSpotItem = activeTab === "spots";
        const isVideo = mediaType === "video" || Boolean(post.video_url?.trim());

        return (
          <article
            key={post.id}
            className="relative aspect-square min-w-0 overflow-hidden bg-slate-950"
          >
            {isOwner && !isSpotItem ? (
              <div className="absolute right-1 top-1 z-20">
                <OwnContentMenu
                  triggerClassName="bg-black/50 backdrop-blur-sm"
                  onDelete={() => deleteOwnedPost(post.id, viewerUserId!)}
                  onDeleted={() => onPostDeleted?.(post.id)}
                />
              </div>
            ) : null}

            {mediaUrl ? (
              <PostMediaLink
                postId={post.id}
                className="block h-full w-full origin-center transition-transform duration-150 ease-out active:scale-[0.97]"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                onViewerItemDeleted={onPostDeleted}
                viewerMode="profile-feed"
              >
                <ProfileGridTileMedia
                  post={post}
                  postId={post.id}
                  gridPreview={activeTab === "spots"}
                  fallbackLabel={spotTitle || post.content?.trim() || t("profile.spotFallback")}
                />
              </PostMediaLink>
            ) : (
              <PostMediaLink
                postId={post.id}
                className="flex h-full w-full origin-center items-center justify-center bg-slate-900 px-2 text-center text-xs leading-snug text-slate-300 transition-transform duration-150 ease-out active:scale-[0.97]"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                onViewerItemDeleted={onPostDeleted}
                viewerMode="profile-feed"
              >
                <span className="line-clamp-4">{spotTitle || post.content?.trim() || t("profile.spotFallback")}</span>
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

function ProfileGridTileMedia({
  post,
  postId,
  gridPreview,
  fallbackLabel,
}: {
  post: ProfileContentPost;
  postId: string;
  gridPreview: boolean;
  fallbackLabel: string;
}) {
  return (
    <div className="h-full w-full animate-[profile-grid-fade-in_320ms_ease-out]">
      <PostCardMedia
        post={post}
        postId={postId}
        gridPreview={gridPreview}
        className="h-full w-full"
        imageClassName="h-full w-full object-cover"
        fallbackLabel={fallbackLabel}
      />
    </div>
  );
}

type ProfileContentTabsProps = {
  activeTab: Exclude<ProfileContentTab, "posts">;
  onTabChange: (tab: Exclude<ProfileContentTab, "posts">) => void;
  personalPosts: ProfileContentPost[];
  spotPosts: ProfileContentPost[];
  loading?: boolean;
  emptyPostsMessage?: string;
  emptySpotsMessage?: string;
  viewerUserId?: string | null;
  onPostDeleted?: (postId: string) => void;
  viewerAuthor?: ViewerPostAuthor | null;
  collectionsPanel?: ReactNode;
  compact?: boolean;
};

export default function ProfileContentTabs({
  activeTab,
  onTabChange,
  personalPosts,
  spotPosts,
  loading = false,
  emptyPostsMessage,
  emptySpotsMessage,
  viewerUserId = null,
  onPostDeleted,
  viewerAuthor = null,
  collectionsPanel = null,
  compact = false,
}: ProfileContentTabsProps) {
  return (
    <div className={`w-full min-w-0 max-w-full space-y-0 overflow-x-hidden ${MOBILE_WIDTH_SAFE_CLASS}`}>
      <ProfileContentTabBar activeTab={activeTab} onTabChange={onTabChange} compact={compact} />
      <ProfileContentGridPanel
        activeTab={activeTab}
        personalPosts={personalPosts}
        spotPosts={spotPosts}
        loading={loading}
        emptyPostsMessage={emptyPostsMessage}
        emptySpotsMessage={emptySpotsMessage}
        viewerUserId={viewerUserId}
        onPostDeleted={onPostDeleted}
        viewerAuthor={viewerAuthor}
        collectionsPanel={collectionsPanel}
        compact={compact}
      />
    </div>
  );
}
