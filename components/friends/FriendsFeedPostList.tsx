"use client";

import { useMemo } from "react";
import Link from "next/link";
import SpotPostMeta from "@/components/SpotPostMeta";
import SpotStatsBar from "@/components/SpotStatsBar";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import ProfileAvatarProfileTrigger from "@/components/ProfileAvatarProfileTrigger";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { useI18n } from "@/components/I18nProvider";
import { getFeedSpotPublicStats, type FeedSpotRow } from "@/lib/feed";
import { feedRowsToViewerItems } from "@/lib/postViewer";
import { postIdsEqual } from "@/lib/postIds";
import { getPostMedia } from "@/lib/posts";
import { getSpotCaption } from "@/lib/spotCaption";
import { shouldShowSpotLocation } from "@/lib/spotLocationDisplay";

type FriendsFeedPostListProps = {
  posts: FeedSpotRow[];
  onPostsChange: (updater: (current: FeedSpotRow[]) => FeedSpotRow[]) => void;
  onCommentsClick: (postId: string) => void;
};

export default function FriendsFeedPostList({
  posts,
  onPostsChange,
  onCommentsClick,
}: FriendsFeedPostListProps) {
  const { t } = useI18n();
  const viewerItems = useMemo(() => feedRowsToViewerItems(posts), [posts]);

  return (
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
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <ProfileAvatarProfileTrigger
                  userId={post.user_id}
                  avatarUrl={post.profiles.avatar_url}
                  sizeClassName="h-10 w-10"
                  iconClassName="h-4 w-4"
                  className="border border-white/10 bg-slate-800"
                />
                <Link
                  href={`/user?id=${post.user_id}`}
                  className="min-w-0 flex-1 text-left transition hover:opacity-90"
                >
                  <UsernameWithVerification
                    username={username}
                    isVerified={post.profiles.is_verified}
                    className="text-sm font-semibold text-white"
                    iconSize={14}
                  />
                </Link>
              </div>
            </header>

            {mediaUrl ? (
              <PostMediaLink
                postId={post.id}
                className="block bg-black"
                viewerItems={viewerItems}
                clickedSpot={viewerItems[postIndex]}
                onViewerItemDeleted={(deletedId) =>
                  onPostsChange((current) => current.filter((item) => !postIdsEqual(item.id, deletedId)))
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
              <SpotStatsBar stats={getFeedSpotPublicStats(post)} onCommentsClick={() => onCommentsClick(post.id)} />
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
  );
}
