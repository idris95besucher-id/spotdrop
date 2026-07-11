"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import ProfilePostFeedCard from "@/components/ProfilePostFeedCard";
import SpotCommentsSheet from "@/components/SpotCommentsSheet";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { findViewerIndexForSpot, type ViewerPostListItem } from "@/lib/postViewer";
import { normalizePostId, postIdsEqual } from "@/lib/postIds";
import { useHorizontalSwipeClose } from "@/lib/useHorizontalSwipeClose";
import { SPOT_STATS_UPDATED_EVENT, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";

type ProfilePostFeedViewerProps = {
  items: ViewerPostListItem[];
  initialSpotId: string;
  initialMediaUrl?: string | null;
  onClose: () => void;
  onItemDeleted?: (postId: string) => void;
};

/**
 * Instagram-style continuous profile post feed.
 * Vertical scroll only pages posts; never dismisses.
 * Close via back button or horizontal swipe-right only.
 */
export default function ProfilePostFeedViewer({
  items: initialItems,
  initialSpotId,
  initialMediaUrl = null,
  onClose,
  onItemDeleted: _onItemDeleted,
}: ProfilePostFeedViewerProps) {
  const { t } = useI18n();
  const { session } = useAuthSession();
  const viewerId = session?.user?.id ?? null;

  const screenRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScrollToInitialRef = useRef(false);
  const [gestureHost, setGestureHost] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(() => typeof document !== "undefined");
  const [posts, setPosts] = useState(initialItems);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const setScreenNode = useCallback((node: HTMLDivElement | null) => {
    screenRef.current = node;
    setGestureHost(node);
  }, []);

  const { panelStyle, screenStyle, requestClose, isClosing } = useHorizontalSwipeClose({
    onClose,
    targetRef: screenRef,
    panelRef,
    enabled: mounted && Boolean(gestureHost),
    gestureHost,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPosts(initialItems);
    didScrollToInitialRef.current = false;
  }, [initialItems]);

  useLayoutEffect(() => {
    if (!mounted || didScrollToInitialRef.current || posts.length === 0) {
      return;
    }

    const targetId = normalizePostId(initialSpotId);
    const scrollRoot = scrollRef.current;

    if (!targetId || !scrollRoot) {
      return;
    }

    const index = findViewerIndexForSpot(posts, targetId, initialMediaUrl);
    const target = posts[index];
    const targetEl = target
      ? scrollRoot.querySelector<HTMLElement>(`[data-profile-feed-post-id="${target.id.replace(/"/g, "")}"]`)
      : null;

    if (targetEl) {
      // Keep previous posts above; place tapped post at the top of the viewport.
      targetEl.scrollIntoView({ block: "start", behavior: "auto" });
      didScrollToInitialRef.current = true;
    }
  }, [initialMediaUrl, initialSpotId, mounted, posts]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.top = `-${scrollY}px`;

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
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
          if (!postIdsEqual(post.id, detail.postId)) {
            return post;
          }

          return {
            ...post,
            visited_count: detail.visited_count ?? post.visited_count,
            comments_count: detail.comments_count ?? post.comments_count,
            saved_count: detail.saved_count ?? post.saved_count,
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isClosing) {
        requestClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isClosing, requestClose]);

  const handleCommentsClick = useCallback((postId: string) => {
    setCommentsPostId(postId);
  }, []);

  if (!mounted || posts.length === 0) {
    return null;
  }

  return createPortal(
    <div
      ref={setScreenNode}
      data-profile-post-feed-screen
      className="fixed inset-0 z-[120] overscroll-none text-white"
      style={screenStyle}
    >
      <div ref={panelRef} data-profile-post-feed-panel className="flex flex-col bg-black" style={panelStyle}>
        <header
          className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 pb-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
        >
          <button
            type="button"
            onClick={requestClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white ring-1 ring-white/10 transition hover:bg-white/10"
            aria-label={t("post.goBack")}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <h1 className="text-base font-semibold text-white">{t("profile.spots")}</h1>
        </header>

        <div
          ref={scrollRef}
          data-profile-post-feed-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {posts.map((post) => (
            <ProfilePostFeedCard key={post.id} post={post} onCommentsClick={handleCommentsClick} />
          ))}
        </div>
      </div>

      <SpotCommentsSheet
        postId={commentsPostId}
        userId={viewerId}
        isOpen={Boolean(commentsPostId)}
        onClose={() => setCommentsPostId(null)}
        elevated
        onCountChange={(count) => {
          if (!commentsPostId) {
            return;
          }

          setPosts((current) =>
            current.map((post) =>
              postIdsEqual(post.id, commentsPostId) ? { ...post, comments_count: count } : post
            )
          );
        }}
      />
    </div>,
    document.body
  );
}
