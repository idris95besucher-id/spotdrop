"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import { useI18n } from "@/components/I18nProvider";
import { getSpotCaption } from "@/lib/spotCaption";
import {
  EXPLORE_PAGE_SIZE,
  loadExploreSpotPostsPage,
  mergeFeedSpotPosts,
  type FeedSpotRow,
} from "@/lib/feed";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { feedRowsToViewerItems } from "@/lib/postViewer";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";
import { shouldHideFromSearchExploreGrid } from "@/lib/searchExploreGrid";
import { SPOT_DELETED_EVENT, type SpotDeletedDetail } from "@/lib/spotDeletedEvents";
import { SPOT_STATS_UPDATED_EVENT, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";
import { getPostMedia } from "@/lib/posts";

/** Compact display: 1 234 → "1.2k", 1 234 567 → "1.2M" */
function formatVisitCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

type SearchExploreGridProps = {
  onPostsChange?: (posts: FeedSpotRow[]) => void;
};

export default function SearchExploreGrid({ onPostsChange }: SearchExploreGridProps) {
  const { t } = useI18n();
  const [posts, setPosts] = useState<FeedSpotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  /** DB pagination offset — always pageIndex * EXPLORE_PAGE_SIZE, never filtered visible count. */
  const fetchOffsetRef = useRef(0);
  const initialLoadStartedRef = useRef(false);

  const visiblePosts = useMemo(
    () => posts.filter((post) => !shouldHideFromSearchExploreGrid(post)),
    [posts]
  );

  const viewerItems = useMemo(() => feedRowsToViewerItems(visiblePosts), [visiblePosts]);

  const loadInitial = useCallback(async () => {
    if (initialLoadStartedRef.current) {
      return;
    }

    initialLoadStartedRef.current = true;
    setLoading(true);
    setError(null);
    fetchOffsetRef.current = 0;

    try {
      const result = await loadExploreSpotPostsPage(0, EXPLORE_PAGE_SIZE);

      setPosts((current) => mergeFeedSpotPosts(current, result.posts));
      fetchOffsetRef.current = result.fetchedCount;
      setHasMore(result.hasMore);
      setError(result.error);

      console.info("[Search Grid] visible spots count", result.posts.length);
    } catch (caught) {
      console.error(
        "[Search Grid] initial load failed",
        caught instanceof Error ? caught.name : "unknown"
      );
      setError("Unable to load spots.");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const retryInitial = useCallback(() => {
    initialLoadStartedRef.current = false;
    setPosts([]);
    setHasMore(true);
    setError(null);
    setLoading(true);
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) {
      return;
    }

    setLoadingMore(true);

    try {
      const offset = fetchOffsetRef.current;
      const result = await loadExploreSpotPostsPage(offset, EXPLORE_PAGE_SIZE);

      if (result.error) {
        setError(result.error);
        return;
      }

      setPosts((current) => {
        const merged = mergeFeedSpotPosts(current, result.posts);
        console.info("[Search Grid] visible spots count", merged.length);
        return merged;
      });

      fetchOffsetRef.current = offset + result.fetchedCount;
      setHasMore(result.hasMore);
    } catch (caught) {
      console.error(
        "[Search Grid] load more failed",
        caught instanceof Error ? caught.name : "unknown"
      );
      setError("Unable to load spots.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const handleSpotDeleted = (event: Event) => {
      const detail = (event as CustomEvent<SpotDeletedDetail>).detail;
      const deletedId = normalizePostId(detail?.postId);

      if (!deletedId) {
        return;
      }

      setPosts((current) => current.filter((post) => normalizePostId(post.id) !== deletedId));
    };

    window.addEventListener(SPOT_DELETED_EVENT, handleSpotDeleted);

    return () => {
      window.removeEventListener(SPOT_DELETED_EVENT, handleSpotDeleted);
    };
  }, []);

  useEffect(() => {
    const handleStatsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SpotStatsUpdatedDetail>).detail;

      if (!detail?.postId) {
        return;
      }

      if (detail.visited_count == null && detail.unique_view_count == null) {
        return;
      }

      setPosts((current) =>
        current.map((post) => {
          if (!postIdsEqual(post.id, detail.postId)) {
            return post;
          }

          return {
            ...post,
            ...(detail.visited_count != null ? { visited_count: detail.visited_count } : {}),
            ...(detail.unique_view_count != null
              ? { unique_view_count: detail.unique_view_count }
              : {}),
          };
        })
      );
    };

    window.addEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);

    return () => {
      window.removeEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);
    };
  }, []);

  useEffect(() => {
    onPostsChange?.(posts);
  }, [onPostsChange, posts]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore]);

  if (loading) {
    return (
      <div className={`grid w-full min-w-0 max-w-full grid-cols-3 gap-px ${MOBILE_WIDTH_SAFE_CLASS}`}>
        {Array.from({ length: 9 }).map((_, index) => (
          <div
            key={`search-explore-skeleton-${index}`}
            className="aspect-square animate-pulse bg-slate-900"
          />
        ))}
      </div>
    );
  }

  if (error && visiblePosts.length === 0) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200">
        <p>{localizeUserMessage(t, error) ?? error}</p>
        <button
          type="button"
          onClick={retryInitial}
          className="mt-3 inline-flex select-none touch-manipulation items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }

  if (visiblePosts.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-card/80 px-6 py-14 text-center">
        <p className="text-sm font-medium text-slate-300">{t("search.exploreEmptyTitle")}</p>
        <p className="mt-1.5 text-sm text-muted">{t("search.exploreEmptyBody")}</p>
      </div>
    );
  }

  const renderTile = (post: FeedSpotRow, postIndex: number) => {
    const { mediaUrl } = getPostMedia(post);
    const spotTitle = post.spot_name?.trim() || null;
    const clickedSpot = postIndex >= 0 ? viewerItems[postIndex] : undefined;
    const uniqueViewCount = post.unique_view_count ?? 0;
    const fallbackLabel = getSpotCaption(post.content) || spotTitle || t("profile.spotFallback");
    const viewsLabel = t("search.uniqueViewsLabel", { count: uniqueViewCount });

    return (
      <article key={post.id} className="relative aspect-square overflow-hidden bg-slate-950">
        <PostMediaLink
          postId={post.id}
          className="block h-full w-full"
          viewerItems={viewerItems}
          clickedSpot={clickedSpot}
          viewerMode="search-reel"
        >
          {mediaUrl ? (
            <PostCardMedia
              post={post}
              postId={post.id}
              gridPreview
              gridVideoAutoplay
              className="aspect-square h-full w-full"
              imageClassName="aspect-square h-full w-full object-cover"
              fallbackLabel={fallbackLabel}
            />
          ) : (
            <div className="flex aspect-square h-full w-full items-center justify-center bg-slate-900 px-2 text-center text-[11px] leading-snug text-slate-300">
              <span className="line-clamp-4">{fallbackLabel}</span>
            </div>
          )}
        </PostMediaLink>

        <div
          className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 backdrop-blur-sm"
          aria-label={viewsLabel}
        >
          <Eye className="h-2.5 w-2.5 shrink-0 text-white/80" strokeWidth={2} aria-hidden />
          <span className="text-[9px] font-semibold leading-none text-white/90">
            {formatVisitCount(uniqueViewCount)}
          </span>
        </div>
      </article>
    );
  };

  return (
    <div className={`space-y-3 select-none touch-manipulation ${MOBILE_WIDTH_SAFE_CLASS}`}>
      <div className="grid w-full min-w-0 max-w-full grid-cols-3 gap-px">
        {visiblePosts.map((post, index) => renderTile(post, index))}
      </div>

      <div ref={sentinelRef} className="flex min-h-8 items-center justify-center py-4">
        {loadingMore ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-hidden /> : null}
        {!hasMore && visiblePosts.length > 0 ? (
          <p className="text-xs text-slate-500">{t("search.exploreEnd")}</p>
        ) : null}
      </div>
    </div>
  );
}
