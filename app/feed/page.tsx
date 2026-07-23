"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import ExploreNearbyCard from "@/components/ExploreNearbyCard";
import PostCardMedia from "@/components/PostCardMedia";
import ProfileAvatar from "@/components/ProfileAvatar";
import SpotCommentsSheet from "@/components/SpotCommentsSheet";
import SpotPostMeta from "@/components/SpotPostMeta";
import SpotStatsBar from "@/components/SpotStatsBar";
import { getSafeAuthSession } from "@/lib/authSession";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";
import { SPOT_DELETED_EVENT, type SpotDeletedDetail } from "@/lib/spotDeletedEvents";
import { getFeedSpotPublicStats, loadExploreFeed, type FeedSpotRow } from "@/lib/feed";
import { feedRowsToViewerItems } from "@/lib/postViewer";
import { shouldShowSpotLocation } from "@/lib/spotLocationDisplay";
import { getSpotCaption } from "@/lib/spotCaption";
import { SPOT_STATS_UPDATED_EVENT, dispatchSpotStatsUpdated, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";
import { getPostMedia } from "@/lib/posts";
import PostMediaLink from "@/components/PostMediaLink";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { MOBILE_PAGE_INNER_CLASS, MOBILE_SAFE_AREA_TOP } from "@/lib/mobileLayout";

export default function FeedPage() {
  const { t } = useI18n();
  const [posts, setPosts] = useState<FeedSpotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const viewerItems = useMemo(() => feedRowsToViewerItems(posts), [posts]);

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      setViewerId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const loadFeed = async () => {
      setLoading(true);
      setError(null);

      const result = await loadExploreFeed();
      setPosts(result.posts);
      setError(result.error);
      setLoading(false);
    };

    void loadFeed();
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
    <Shell showHeader={false} flushTop>
      <div className={`${MOBILE_PAGE_INNER_CLASS} space-y-5 pb-4 select-none touch-manipulation`}>
        <header className={`${MOBILE_SAFE_AREA_TOP} pb-1`}>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">{t("feed.explore")}</p>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-white">
            <SpotDropSpotsIcon
              className="h-7 w-7 shrink-0 text-primary [filter:drop-shadow(0_0_8px_var(--sd-primary-glow))]"
              strokeWidth={1.75}
              aria-hidden
            />
            {t("nav.spots")}
          </h1>
          <p className="mt-1.5 text-sm text-muted">{t("feed.subtitle")}</p>
        </header>

        <ExploreNearbyCard />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`feed-skeleton-${index}`}
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
            <SpotDropSpotsIcon className="mx-auto h-7 w-7 text-accent [filter:drop-shadow(0_0_8px_var(--sd-primary-glow))]" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 text-sm font-medium text-slate-300">{t("feed.emptyTitle")}</p>
            <p className="mt-1.5 text-sm text-muted">{t("feed.emptyBody")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post, postIndex) => {
              const { mediaUrl } = getPostMedia(post);
              const username = post.profiles.username || t("common.user");
              const placeJoin = post.discovery_places;
              const placeName = Array.isArray(placeJoin) ? placeJoin[0]?.name : placeJoin?.name;
              const locationFields = {
                id: post.id,
                user_id: post.user_id,
                content_kind: post.content_kind,
                spot_name: post.spot_name,
                spot_address: post.spot_address,
                spot_city: post.spot_city,
                spot_country: post.spot_country,
                spot_latitude: post.spot_latitude,
                spot_longitude: post.spot_longitude,
                placeName: placeName ?? null,
              };
              const showMeta =
                getSpotCaption(post.content) ||
                shouldShowSpotLocation(locationFields) ||
                post.created_at;

              return (
                <article
                  key={post.id}
                  className="select-none touch-manipulation overflow-hidden rounded-2xl border border-white/[0.08] bg-card"
                >
                  <header className="flex items-center gap-3 px-4 py-3">
                    <Link
                      href={`/user?id=${post.user_id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-90"
                    >
                      <ProfileAvatar
                        src={post.profiles.avatar_url}
                        sizeClassName="h-10 w-10"
                        iconClassName="h-4 w-4"
                        className="border border-white/10 bg-slate-800"
                      />
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-white">{username}</p>
                      </div>
                    </Link>
                  </header>

                  {mediaUrl ? (
                    <PostMediaLink
                      postId={post.id}
                      className="block bg-black"
                      viewerItems={viewerItems}
                      clickedSpot={viewerItems[postIndex]}
                      onViewerItemDeleted={(deletedId) =>
                        setPosts((current) => current.filter((item) => !postIdsEqual(item.id, deletedId)))
                      }
                    >
                      <PostCardMedia
                        post={post}
                        className="aspect-[4/5] w-full"
                        imageClassName="aspect-[4/5] w-full object-cover"
                      />
                    </PostMediaLink>
                  ) : null}

                  <div className="px-4 pb-1 pt-2">
                    <SpotStatsBar
                      stats={getFeedSpotPublicStats(post)}
                      onCommentsClick={() => setCommentsPostId(post.id)}
                    />
                  </div>

                  {showMeta ? (
                    <div className="px-4 py-3">
                      <SpotPostMeta
                        content={post.content}
                        location={locationFields}
                        createdAt={post.created_at}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
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
    </Shell>
  );
}
