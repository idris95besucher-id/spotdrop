"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import OwnContentMenu from "@/components/OwnContentMenu";
import { getSafeAuthSession } from "@/lib/authSession";
import { deleteOwnedSpot } from "@/lib/deleteContent";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";
import { SPOT_DELETED_EVENT, type SpotDeletedDetail } from "@/lib/spotDeletedEvents";
import SpotLocationSummary from "@/components/SpotLocationSummary";
import SpotStatsBar from "@/components/SpotStatsBar";
import SpotCommentsSheet from "@/components/SpotCommentsSheet";
import ExploreCollectionCard from "@/components/ExploreCollectionCard";
import ExploreNearbyCard from "@/components/ExploreNearbyCard";
import { formatFeedSpotTitle, getFeedSpotPublicStats, loadExploreFeed, type FeedSpotRow } from "@/lib/feed";
import type { CollectionWithMeta } from "@/lib/collections";
import { feedRowsToViewerItems } from "@/lib/postViewer";
import { shouldShowSpotLocation } from "@/lib/spotLocationDisplay";
import { SPOT_STATS_UPDATED_EVENT, dispatchSpotStatsUpdated, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";
import { formatPostTime, getPostMedia } from "@/lib/posts";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";

export default function FeedPage() {
  const { t } = useI18n();
  const [posts, setPosts] = useState<FeedSpotRow[]>([]);
  const [collections, setCollections] = useState<CollectionWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const viewerItems = feedRowsToViewerItems(posts);

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
      setCollections(result.collections);
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
    <Shell>
      <div className="mx-auto w-full max-w-lg space-y-5 pb-8">
        <header className="px-1 pt-1">
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
        ) : posts.length === 0 && collections.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-card/80 px-6 py-14 text-center">
            <SpotDropSpotsIcon className="mx-auto h-7 w-7 text-accent [filter:drop-shadow(0_0_8px_var(--sd-primary-glow))]" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 text-sm font-medium text-slate-300">{t("feed.emptyTitle")}</p>
            <p className="mt-1.5 text-sm text-muted">{t("feed.emptyBody")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {collections.length > 0 ? (
              <section className="space-y-3">
                <h2 className="px-1 text-sm font-semibold text-white">{t("feed.publicCollections")}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {collections.map((collection) => (
                    <ExploreCollectionCard key={collection.id} collection={collection} />
                  ))}
                </div>
              </section>
            ) : null}
            {posts.map((post, postIndex) => {
              const { mediaUrl } = getPostMedia(post);
              const username = post.profiles.username || t("common.user");
              const spotTitle = formatFeedSpotTitle(post);
              const placeJoin = post.discovery_places;
              const placeName = Array.isArray(placeJoin) ? placeJoin[0]?.name : placeJoin?.name;
              const showLocation = shouldShowSpotLocation({
                content_kind: post.content_kind,
                spot_name: post.spot_name,
                spot_address: post.spot_address,
                spot_city: post.spot_city,
                spot_country: post.spot_country,
                spot_latitude: post.spot_latitude,
                spot_longitude: post.spot_longitude,
                placeName: placeName ?? null,
              });
              const caption = post.content?.trim();

              return (
                <article
                  key={post.id}
                  className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card"
                >
                  <header className="flex items-center gap-3 px-4 py-3">
                    <Link
                      href={`/user/${post.user_id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-90"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
                        {post.profiles.avatar_url ? (
                          <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-white">{username}</p>
                        <time className="text-xs text-slate-500" dateTime={post.created_at}>
                          {formatPostTime(post.created_at)}
                        </time>
                      </div>
                    </Link>
                    {viewerId === post.user_id ? (
                      <OwnContentMenu
                        onDelete={() => deleteOwnedSpot(post.id, viewerId)}
                        confirmTitle={t("content.deleteSpotTitle")}
                        confirmBody={null}
                        deletedToast={t("content.spotDeleted")}
                        onDeleted={() =>
                          setPosts((current) => current.filter((item) => !postIdsEqual(item.id, post.id)))
                        }
                      />
                    ) : null}
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

                  {(spotTitle || showLocation || caption) ? (
                    <div className="space-y-1.5 px-4 py-3">
                      {spotTitle ? (
                        <p className="text-sm font-semibold text-white">{spotTitle}</p>
                      ) : null}
                      {showLocation ? (
                        <SpotLocationSummary
                          location={{
                            id: post.id,
                            content_kind: post.content_kind,
                            spot_name: post.spot_name,
                            spot_address: post.spot_address,
                            spot_city: post.spot_city,
                            spot_country: post.spot_country,
                            spot_latitude: post.spot_latitude,
                            spot_longitude: post.spot_longitude,
                            placeName: placeName ?? null,
                          }}
                        />
                      ) : null}
                      {caption ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{caption}</p>
                      ) : null}
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
