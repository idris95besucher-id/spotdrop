"use client";

import { useMemo, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import OwnContentMenu from "@/components/OwnContentMenu";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { deleteOwnedPost, deleteOwnedSpot } from "@/lib/deleteContent";
import {
  getProfilePostMedia,
  getSpotDisplayLabel,
  getSpotLocationLine,
  type ProfileContentPost,
} from "@/lib/profileContent";
import { normalizePostId } from "@/lib/postIds";
import { profilePostsToViewerItems, type ViewerPostAuthor } from "@/lib/postViewer";

type ProfileContentTab = "posts" | "spots" | "collections";

type ProfileContentTabBarProps = {
  activeTab: ProfileContentTab;
  onTabChange: (tab: ProfileContentTab) => void;
  compact?: boolean;
};

export function ProfileContentTabBar({ activeTab, onTabChange, compact = false }: ProfileContentTabBarProps) {
  const { t } = useI18n();
  const tabClass = compact ? "py-2.5 text-xs" : "py-3.5 text-sm";

  return (
    <div className={`grid w-full min-w-0 max-w-full grid-cols-3 border-b-2 border-white/10 bg-card ${MOBILE_WIDTH_SAFE_CLASS}`}>
      <button
        type="button"
        onClick={() => onTabChange("spots")}
        className={`${tabClass} text-center font-bold tracking-wide transition ${
          activeTab === "spots"
            ? "border-b-4 border-primary text-white"
            : "border-b-4 border-transparent text-muted hover:text-slate-200"
        }`}
      >
        {t("profile.spots")}
      </button>
      <button
        type="button"
        onClick={() => onTabChange("posts")}
        className={`${tabClass} text-center font-bold tracking-wide transition ${
          activeTab === "posts"
            ? "border-b-4 border-primary text-white"
            : "border-b-4 border-transparent text-muted hover:text-slate-200"
        }`}
      >
        {t("profile.posts")}
      </button>
      <button
        type="button"
        onClick={() => onTabChange("collections")}
        className={`${tabClass} text-center font-bold tracking-wide transition ${
          activeTab === "collections"
            ? "border-b-4 border-primary text-white"
            : "border-b-4 border-transparent text-muted hover:text-slate-200"
        }`}
      >
        {t("profile.collections")}
      </button>
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
  compact = false,
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

  const emptyMessage =
    activeTab === "posts"
      ? (emptyPostsMessage ?? t("profile.noPostsYet"))
      : (emptySpotsMessage ?? t("profile.noPublicSpotsYet"));

  if (activeTab === "collections") {
    return <div className={MOBILE_WIDTH_SAFE_CLASS}>{collectionsPanel}</div>;
  }

  if (loading) {
    return (
      <div className={`grid w-full min-w-0 max-w-full grid-cols-3 gap-0.5 ${MOBILE_WIDTH_SAFE_CLASS}`}>
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={`profile-grid-loading-${index}`} className="aspect-square animate-pulse bg-slate-900" />
        ))}
      </div>
    );
  }

  if (activeItems.length === 0) {
    return (
      <div className={`px-4 text-center text-sm text-slate-400 ${compact ? "py-6" : "py-10"} ${MOBILE_WIDTH_SAFE_CLASS}`}>
        {activeTab === "spots" ? (
          <SpotDropSpotsIcon
            className="mx-auto mb-3 h-7 w-7 text-accent [filter:drop-shadow(0_0_8px_var(--sd-primary-glow))]"
            strokeWidth={1.5}
            aria-hidden
          />
        ) : null}
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`grid w-full min-w-0 max-w-full grid-cols-3 gap-0.5 ${MOBILE_WIDTH_SAFE_CLASS}`}>
      {activeItems.map((post, gridIndex) => {
        const { mediaUrl } = getProfilePostMedia(post);
        const spotTitle = getSpotDisplayLabel(post);
        const spotLocation = getSpotLocationLine(post);
        const clickedSpot = viewerItems[gridIndex];

        const isOwner = Boolean(viewerUserId && post.user_id === viewerUserId);
        const isSpotItem = activeTab === "spots";

        return (
          <article key={post.id} className="relative aspect-square overflow-hidden bg-slate-950">
            {isOwner ? (
              <div className="absolute right-1 top-1 z-10">
                <OwnContentMenu
                  className="[&_button]:bg-black/50 [&_button]:backdrop-blur-sm"
                  confirmTitle={isSpotItem ? t("content.deleteSpotTitle") : undefined}
                  confirmBody={isSpotItem ? null : undefined}
                  deletedToast={isSpotItem ? t("content.spotDeleted") : null}
                  onDelete={() =>
                    isSpotItem
                      ? deleteOwnedSpot(post.id, viewerUserId!)
                      : deleteOwnedPost(post.id, viewerUserId!)
                  }
                  onDeleted={() => onPostDeleted?.(post.id)}
                />
              </div>
            ) : null}
            {mediaUrl ? (
              <PostMediaLink
                postId={post.id}
                className="block h-full w-full"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                onViewerItemDeleted={onPostDeleted}
              >
                <PostCardMedia
                  post={post}
                  className="aspect-square h-full w-full"
                  imageClassName="aspect-square h-full w-full object-cover"
                />
              </PostMediaLink>
            ) : (
              <PostMediaLink
                postId={post.id}
                className="flex aspect-square h-full w-full items-center justify-center bg-slate-900 px-2 text-center text-xs leading-snug text-slate-300"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                onViewerItemDeleted={onPostDeleted}
              >
                <span className="line-clamp-4">{spotTitle || post.content?.trim() || t("profile.spotFallback")}</span>
              </PostMediaLink>
            )}

            {activeTab === "spots" && (spotTitle || spotLocation) ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-2 pt-8">
                {spotTitle ? (
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-white">
                    <MapPin className="h-3 w-3 shrink-0 text-white/70" strokeWidth={1.75} aria-hidden />
                    <span className="truncate">{spotTitle}</span>
                  </p>
                ) : null}
                {spotLocation && spotLocation !== spotTitle ? (
                  <p className="mt-0.5 truncate text-[10px] text-white/60">{spotLocation}</p>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

type ProfileContentTabsProps = {
  activeTab: ProfileContentTab;
  onTabChange: (tab: ProfileContentTab) => void;
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

export type { ProfileContentTab };
