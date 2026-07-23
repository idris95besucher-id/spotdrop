"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import VerticalPostViewer from "@/components/VerticalPostViewer";
import ProfilePostFeedViewer from "@/components/ProfilePostFeedViewer";
import {
  findViewerIndexForSpot,
  getViewerSpotMediaUrl,
  type ViewerPostListItem,
} from "@/lib/postViewer";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";

export type PostViewerMode = "reel" | "profile-feed" | "search-reel";

type OpenPostViewerOptions = {
  onItemDeleted?: (postId: string) => void;
  initialSpotId: string;
  initialMediaUrl?: string | null;
  /**
   * profile-feed = Instagram-style continuous list (profile grid).
   * search-reel / reel = fullscreen pager. Both support swipe-right-to-close
   * (back button also works); the two are behaviourally identical and kept
   * separate only so call sites can stay self-documenting.
   */
  mode?: PostViewerMode;
};

type PostViewerContextValue = {
  openPostViewer: (items: ViewerPostListItem[], options: OpenPostViewerOptions) => void;
  closePostViewer: () => void;
};

const PostViewerContext = createContext<PostViewerContextValue | null>(null);

export function usePostViewer() {
  const context = useContext(PostViewerContext);

  if (!context) {
    throw new Error("usePostViewer must be used within PostViewerProvider");
  }

  return context;
}

export function usePostViewerOptional() {
  return useContext(PostViewerContext);
}

type ViewerState = {
  items: ViewerPostListItem[];
  initialIndex: number;
  initialSpotId: string;
  initialMediaUrl: string | null;
  openId: string;
  mode: PostViewerMode;
  onItemDeleted?: (postId: string) => void;
};

export default function PostViewerProvider({ children }: { children: ReactNode }) {
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);

  const closePostViewer = useCallback(() => {
    setViewerState(null);
  }, []);

  const openPostViewer = useCallback((items: ViewerPostListItem[], options: OpenPostViewerOptions) => {
    if (items.length === 0) {
      return;
    }

    const frozenItems = items.map((item) => ({ ...item }));
    const initialSpotId = normalizePostId(options.initialSpotId);

    if (!initialSpotId) {
      return;
    }

    const initialMediaUrl =
      options.initialMediaUrl?.trim() ||
      getViewerSpotMediaUrl(
        frozenItems.find((spot) => normalizePostId(spot.id) === initialSpotId) ?? frozenItems[0]!
      );
    const initialIndex = findViewerIndexForSpot(frozenItems, initialSpotId, initialMediaUrl);
    const mode = options.mode ?? "reel";

    setViewerState({
      items: frozenItems,
      initialIndex,
      initialSpotId,
      initialMediaUrl,
      openId: `${mode}-${initialSpotId}-${Date.now()}`,
      mode,
      onItemDeleted: options.onItemDeleted,
    });
  }, []);

  const handleItemDeleted = useCallback((postId: string) => {
    setViewerState((current) => {
      if (!current) {
        return null;
      }

      const deletedId = normalizePostId(postId);

      if (!deletedId) {
        return current;
      }

      const deletedIndex = current.items.findIndex((item) => postIdsEqual(item.id, deletedId));

      current.onItemDeleted?.(postId);

      const nextItems = current.items.filter((item) => !postIdsEqual(item.id, deletedId));

      if (nextItems.length === 0) {
        return null;
      }

      const nextIndex =
        deletedIndex >= 0
          ? Math.min(deletedIndex, nextItems.length - 1)
          : findViewerIndexForSpot(nextItems, current.initialSpotId, current.initialMediaUrl);

      const anchor = nextItems[nextIndex]!;
      const anchorId = normalizePostId(anchor.id);

      if (!anchorId) {
        return null;
      }

      return {
        ...current,
        items: nextItems,
        initialIndex: nextIndex,
        initialSpotId: anchorId,
        initialMediaUrl: getViewerSpotMediaUrl(anchor),
        openId: `${current.mode}-${anchorId}-${Date.now()}`,
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      openPostViewer,
      closePostViewer,
    }),
    [closePostViewer, openPostViewer]
  );

  return (
    <PostViewerContext.Provider value={value}>
      {children}
      {viewerState ? (
        viewerState.mode === "profile-feed" ? (
          <ProfilePostFeedViewer
            key={viewerState.openId}
            items={viewerState.items}
            initialSpotId={viewerState.initialSpotId}
            initialMediaUrl={viewerState.initialMediaUrl}
            onClose={closePostViewer}
            onItemDeleted={handleItemDeleted}
          />
        ) : (
          <VerticalPostViewer
            key={viewerState.openId}
            items={viewerState.items}
            initialIndex={viewerState.initialIndex}
            initialSpotId={viewerState.initialSpotId}
            initialMediaUrl={viewerState.initialMediaUrl}
            onClose={closePostViewer}
            onItemDeleted={handleItemDeleted}
            enableHorizontalSwipeClose
            closeBeforeAuthorProfileNavigation={viewerState.mode === "search-reel"}
          />
        )
      ) : null}
    </PostViewerContext.Provider>
  );
}
