"use client";

import { UserRound } from "lucide-react";
import PublicationAuthorHeader from "@/components/PublicationAuthorHeader";
import SpotPostMeta from "@/components/SpotPostMeta";
import SpotStatsBar from "@/components/SpotStatsBar";
import PostCardMedia from "@/components/PostCardMedia";
import { useI18n } from "@/components/I18nProvider";
import { getPostMedia } from "@/lib/posts";
import { getSpotCaption } from "@/lib/spotCaption";
import { shouldShowSpotLocation } from "@/lib/spotLocationDisplay";
import { normalizeSpotPublicStats } from "@/lib/spotRanking";
import type { ViewerPostListItem } from "@/lib/postViewer";

type ProfilePostFeedCardProps = {
  post: ViewerPostListItem;
  viewerUserId?: string | null;
  onCommentsClick: (postId: string) => void;
  onEdit?: () => void;
  onDelete: () => Promise<{ ok: boolean; error: string | null }>;
  onDeleted?: () => void;
};

export default function ProfilePostFeedCard({
  post,
  viewerUserId = null,
  onCommentsClick,
  onEdit,
  onDelete,
  onDeleted,
}: ProfilePostFeedCardProps) {
  const { t } = useI18n();
  const { mediaUrl } = getPostMedia(post);
  const username = post.profiles?.username || t("common.user");
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
    Boolean(getSpotCaption(post.content)) ||
    shouldShowSpotLocation(locationFields) ||
    Boolean(post.created_at);
  const stats = normalizeSpotPublicStats(post);
  const isOwner = Boolean(viewerUserId && post.user_id === viewerUserId);

  return (
    <article
      data-profile-feed-post-id={post.id}
      className="select-none touch-manipulation overflow-hidden border-b border-white/[0.08] bg-black"
    >
      <header className="flex items-center gap-2 px-4 py-3">
        {isOwner ? (
          <PublicationAuthorHeader
            authorUserId={post.user_id}
            authorUsername={username}
            avatarUrl={post.profiles?.avatar_url}
            viewerUserId={viewerUserId}
            menuTriggerClassName="bg-white/5 ring-1 ring-white/10"
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleted={onDeleted}
            className="w-full"
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
              {post.profiles?.avatar_url ? (
                <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} aria-hidden />
              )}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{username}</p>
          </div>
        )}
      </header>

      {mediaUrl ? (
        <div className="bg-black">
          <PostCardMedia
            post={post}
            postId={post.id}
            className="aspect-[4/5] w-full"
            imageClassName="aspect-[4/5] w-full object-cover"
            zoomable
          />
        </div>
      ) : null}

      <div className="px-4 pb-1 pt-2">
        <SpotStatsBar stats={stats} onCommentsClick={() => onCommentsClick(post.id)} />
      </div>

      {showMeta ? (
        <div className="px-4 py-3">
          <SpotPostMeta
            content={post.content}
            location={locationFields}
            createdAt={post.created_at}
            currentVisitedCount={stats.visited_count}
          />
        </div>
      ) : null}
    </article>
  );
}
