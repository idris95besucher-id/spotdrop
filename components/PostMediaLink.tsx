"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { usePostViewerOptional, type PostViewerMode } from "@/components/PostViewerProvider";
import { getViewerSpotMediaUrl, type ViewerPostListItem } from "@/lib/postViewer";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";

type PostMediaLinkProps = {
  postId: unknown;
  children: ReactNode;
  className?: string;
  viewerItems?: ViewerPostListItem[];
  /** Full spot object from the same array as viewerItems. */
  clickedSpot?: ViewerPostListItem;
  onViewerItemDeleted?: (postId: string) => void;
  /** profile-feed for profile grids; search-reel for Search; reel (default) elsewhere. */
  viewerMode?: PostViewerMode;
};

export default function PostMediaLink({
  postId,
  children,
  className,
  viewerItems,
  clickedSpot,
  onViewerItemDeleted,
  viewerMode = "reel",
}: PostMediaLinkProps) {
  const postViewer = usePostViewerOptional();
  const id = normalizePostId(postId);

  if (!id) {
    return <div className={className}>{children}</div>;
  }

  const href = `/posts?id=${encodeURIComponent(id)}`;
  const canOpenViewer = Boolean(postViewer && viewerItems && viewerItems.length > 0);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!canOpenViewer || !viewerItems || !postViewer) {
      return;
    }

    const spot =
      clickedSpot ??
      viewerItems.find((item) => postIdsEqual(item.id, id)) ??
      null;

    if (!spot) {
      return;
    }

    const initialSpotId = spot.id;
    const initialMediaUrl = getViewerSpotMediaUrl(spot);

    event.preventDefault();
    postViewer.openPostViewer(viewerItems, {
      onItemDeleted: onViewerItemDeleted,
      initialSpotId,
      initialMediaUrl,
      mode: viewerMode,
    });
  };

  return (
    <Link href={href} className={className} scroll prefetch={false} onClick={handleClick}>
      {children}
    </Link>
  );
}
