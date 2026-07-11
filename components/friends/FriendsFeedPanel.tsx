"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import FriendsFeedPostList from "@/components/friends/FriendsFeedPostList";
import SpotCommentsSheet from "@/components/SpotCommentsSheet";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { loadFollowingFeed, type FeedSpotRow } from "@/lib/feed";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { MOBILE_PANEL_SCROLL_CLASS } from "@/lib/mobileLayout";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";
import { SPOT_DELETED_EVENT, type SpotDeletedDetail } from "@/lib/spotDeletedEvents";
import { SPOT_STATS_UPDATED_EVENT, dispatchSpotStatsUpdated, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";

export default function FriendsFeedPanel() {
  const { t } = useI18n();
  const [posts, setPosts] = useState<FeedSpotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      setViewerId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFeed = async () => {
      setLoading(true);
      setError(null);

      const sessionResult = await getSafeAuthSession();
      const userId = sessionResult.session?.user?.id ?? null;

      if (!cancelled) {
        setViewerId(userId);
      }

      const result = await loadFollowingFeed(userId);

      if (cancelled) {
        return;
      }

      setPosts(result.posts);
      setError(result.error);
      setLoading(false);
    };

    void loadFeed();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleStatsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SpotStatsUpdatedDetail>).detail;

      if (!detail?.postId) {
        return;
      }

      setPosts((current) =>
        current.map((post) => {
          if (post.id !== detail.postId) {
            return post;
          }

          return {
            ...post,
            visited_count: detail.visited_count ?? post.visited_count,
            comments_count: detail.comments_count ?? post.comments_count,
            collection_save_count: detail.saved_count ?? post.collection_save_count,
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
    const handleSpotDeleted = (event: Event) => {
      const detail = (event as CustomEvent<SpotDeletedDetail>).detail;
      const deletedId = normalizePostId(detail?.postId);

      if (!deletedId) {
        return;
      }

      setPosts((current) => current.filter((post) => !postIdsEqual(post.id, deletedId)));
    };

    window.addEventListener(SPOT_DELETED_EVENT, handleSpotDeleted);

    return () => {
      window.removeEventListener(SPOT_DELETED_EVENT, handleSpotDeleted);
    };
  }, []);

  return (
    <>
      <div className={`${MOBILE_PANEL_SCROLL_CLASS} px-4 pb-4 pt-4 sm:px-0`}>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`friends-feed-skeleton-${index}`}
                className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card"
              >
                <div className="flex items-center gap-3 border-b border-white/10 p-4">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-slate-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-24 animate-pulse rounded-full bg-slate-800" />
                    <div className="h-3 w-14 animate-pulse rounded-full bg-slate-800/70" />
                  </div>
                </div>
                <div className="aspect-[4/5] animate-pulse bg-slate-800/80" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200">
            {localizeUserMessage(t, error) ?? error}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card/80 px-6 py-14 text-center">
            <UserRound className="mx-auto h-7 w-7 text-primary [filter:drop-shadow(0_0_8px_var(--sd-primary-glow))]" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 text-sm font-medium text-slate-300">{t("friends.feedEmptyTitle")}</p>
            <p className="mt-1.5 text-sm text-muted">{t("friends.feedEmptyBody")}</p>
          </div>
        ) : (
          <FriendsFeedPostList
            posts={posts}
            onPostsChange={setPosts}
            onCommentsClick={setCommentsPostId}
          />
        )}
      </div>

      <SpotCommentsSheet
        postId={commentsPostId}
        userId={viewerId}
        isOpen={Boolean(commentsPostId)}
        onClose={() => setCommentsPostId(null)}
        onCountChange={(count) => {
          if (commentsPostId) {
            dispatchSpotStatsUpdated({ postId: commentsPostId, comments_count: count });
          }
        }}
      />
    </>
  );
}
