"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import VerticalPostViewer from "@/components/VerticalPostViewer";
import {
  findViewerIndexForSpot,
  getViewerSpotMediaUrl,
  type ViewerPostListItem,
} from "@/lib/postViewer";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";

type OpenPostViewerOptions = {
  onItemDeleted?: (postId: string) => void;
  initialSpotId: string;
  initialMediaUrl?: string | null;
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

    const initialMediaUrl = options.initialMediaUrl?.trim() || getViewerSpotMediaUrl(
      frozenItems.find((spot) => normalizePostId(spot.id) === initialSpotId) ?? frozenItems[0]!
    );
    const initialIndex = findViewerIndexForSpot(frozenItems, initialSpotId, initialMediaUrl);

    setViewerState({
      items: frozenItems,
      initialIndex,
      initialSpotId,
      initialMediaUrl,
      openId: `${initialSpotId}-${Date.now()}`,
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
        deletedIndex >= 0 ? Math.min(deletedIndex, nextItems.length - 1) : findViewerIndexForSpot(nextItems, current.initialSpotId, current.initialMediaUrl);

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
        openId: `${anchorId}-${Date.now()}`,
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
        <VerticalPostViewer
          key={viewerState.openId}
          items={viewerState.items}
          initialIndex={viewerState.initialIndex}
          initialSpotId={viewerState.initialSpotId}
          initialMediaUrl={viewerState.initialMediaUrl}
          onClose={closePostViewer}
          onItemDeleted={handleItemDeleted}
        />
      ) : null}
    </PostViewerContext.Provider>
  );
}
