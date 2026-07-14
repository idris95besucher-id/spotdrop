"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Bookmark, LayoutGrid, Play } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import OwnContentMenu from "@/components/OwnContentMenu";
import EditPublicationScreen from "@/components/EditPublicationScreen";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { deleteOwnedPublication } from "@/lib/deleteContent";
import { dispatchProfileContentRefresh } from "@/lib/profileContentRefresh";
import {
  getProfilePostMedia,
  getSpotDisplayLabel,
  type ProfileContentPost,
} from "@/lib/profileContent";
import { normalizePostId } from "@/lib/postIds";
import { profilePostsToViewerItems, type ViewerPostAuthor } from "@/lib/postViewer";

/** Profile main tabs: Spots/Posts (public) and Saved (owner-only). Gallery is separate. */
export type ProfileContentTab = "spots" | "saved" | "collections" | "posts";
export type ProfileMainTab = "spots" | "saved";

/** @deprecated Use "saved". Kept so old sessionStorage values still resolve. */
export function normalizeProfileMainTab(tab: string | null | undefined): ProfileMainTab {
  if (tab === "saved" || tab === "collections") {
    return "saved";
  }

  return "spots";
}

const PROFILE_GRID_GAP_CLASS = "gap-px";
const PROFILE_GRID_CLASS = `grid w-full min-w-0 max-w-full grid-cols-3 ${PROFILE_GRID_GAP_CLASS} ${MOBILE_WIDTH_SAFE_CLASS}`;

const SWIPE_AXIS_LOCK_PX = 10;
const SWIPE_DISTANCE_PX = 50;
const SWIPE_VELOCITY_PX_MS = 0.45;
const SWIPE_SNAP_MS = 220;
const VELOCITY_SAMPLE_WINDOW_MS = 100;

type ProfileContentTabBarProps = {
  activeTab: ProfileMainTab;
  onTabChange: (tab: ProfileMainTab) => void;
  /** 0 = Posts, 1 = Saved — drives the small underline during swipe. */
  progress?: number;
  compact?: boolean;
};

export function ProfileContentTabBar({
  activeTab,
  onTabChange,
  progress,
  compact = false,
}: ProfileContentTabBarProps) {
  const { t } = useI18n();
  const rowPad = compact ? "py-2.5" : "py-3";
  const clampedProgress = Math.min(1, Math.max(0, progress ?? (activeTab === "saved" ? 1 : 0)));
  const visualTab: ProfileMainTab = clampedProgress >= 0.5 ? "saved" : "spots";
  const indicatorCenter = `${25 + clampedProgress * 50}%`;

  return (
    <div
      role="tablist"
      className={`relative grid w-full min-w-0 max-w-full grid-cols-2 border-b border-white/10 bg-card ${MOBILE_WIDTH_SAFE_CLASS}`}
    >
      <button
        type="button"
        role="tab"
        onClick={() => onTabChange("spots")}
        aria-label={t("profile.spots")}
        aria-selected={activeTab === "spots"}
        className={`flex ${rowPad} items-center justify-center transition-colors duration-200 ${
          visualTab === "spots" ? "text-primary" : "text-muted hover:text-slate-300"
        }`}
      >
        <LayoutGrid
          className="h-[22px] w-[22px]"
          strokeWidth={visualTab === "spots" ? 2.25 : 1.75}
          aria-hidden
        />
      </button>
      <button
        type="button"
        role="tab"
        onClick={() => onTabChange("saved")}
        aria-label={t("profile.saved")}
        aria-selected={activeTab === "saved"}
        className={`flex ${rowPad} items-center justify-center transition-colors duration-200 ${
          visualTab === "saved" ? "text-primary" : "text-muted hover:text-slate-300"
        }`}
      >
        <Bookmark
          className="h-[22px] w-[22px]"
          strokeWidth={visualTab === "saved" ? 2.25 : 1.75}
          aria-hidden
        />
      </button>

      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 h-[2.5px] w-9 -translate-x-1/2 rounded-full bg-primary"
        style={{
          left: indicatorCenter,
          transition: progress == null ? `left ${SWIPE_SNAP_MS}ms ease-out` : "none",
        }}
      />
    </div>
  );
}

type ProfileContentGridPanelProps = {
  activeTab: ProfileContentTab;
  personalPosts: ProfileContentPost[];
  spotPosts: ProfileContentPost[];
  loading?: boolean;
  emptyPostsMessage?: string;
  emptySpotsMessage?: string;
  viewerUserId?: string | null;
  onPostDeleted?: (postId: string) => void;
  viewerAuthor?: ViewerPostAuthor | null;
  savedPanel?: ReactNode;
  compact?: boolean;
};

/** Renders Posts/Spots grid or Saved panel for a single tab (non-swipe callers). */
export function ProfileContentGridPanel({
  activeTab,
  personalPosts,
  spotPosts,
  loading = false,
  emptyPostsMessage,
  emptySpotsMessage,
  viewerUserId = null,
  onPostDeleted,
  viewerAuthor = null,
  savedPanel = null,
  compact: _compact = false,
}: ProfileContentGridPanelProps) {
  if (activeTab === "saved" || activeTab === "collections") {
    return <div className={MOBILE_WIDTH_SAFE_CLASS}>{savedPanel}</div>;
  }

  return (
    <ProfilePostsGrid
      mode={activeTab === "posts" ? "posts" : "spots"}
      personalPosts={personalPosts}
      spotPosts={spotPosts}
      loading={loading}
      emptyPostsMessage={emptyPostsMessage}
      emptySpotsMessage={emptySpotsMessage}
      viewerUserId={viewerUserId}
      onPostDeleted={onPostDeleted}
      viewerAuthor={viewerAuthor}
    />
  );
}

function ProfilePostsGrid({
  mode,
  personalPosts,
  spotPosts,
  loading = false,
  emptyPostsMessage,
  emptySpotsMessage,
  viewerUserId = null,
  onPostDeleted,
  viewerAuthor = null,
}: {
  mode: "posts" | "spots";
  personalPosts: ProfileContentPost[];
  spotPosts: ProfileContentPost[];
  loading?: boolean;
  emptyPostsMessage?: string;
  emptySpotsMessage?: string;
  viewerUserId?: string | null;
  onPostDeleted?: (postId: string) => void;
  viewerAuthor?: ViewerPostAuthor | null;
}) {
  const { t } = useI18n();
  const [editPost, setEditPost] = useState<ProfileContentPost | null>(null);
  const activeItems = (mode === "posts" ? personalPosts : spotPosts).filter((post) =>
    Boolean(normalizePostId(post.id))
  );

  const viewerItems = useMemo(() => {
    if (!viewerAuthor) {
      return [];
    }

    return profilePostsToViewerItems(activeItems, viewerAuthor);
  }, [activeItems, viewerAuthor]);

  if (loading) {
    return (
      <div className={PROFILE_GRID_CLASS}>
        {Array.from({ length: 9 }).map((_, index) => (
          <div
            key={`profile-grid-loading-${index}`}
            className="aspect-square animate-pulse bg-slate-900/90"
          />
        ))}
      </div>
    );
  }

  if (activeItems.length === 0) {
    const emptyTitle =
      mode === "posts"
        ? (emptyPostsMessage ?? t("profile.noPostsYet"))
        : (emptySpotsMessage ?? t("profile.noPostsYet"));

    return (
      <div
        className={`profile-header-enter flex min-h-[42vh] flex-col items-center justify-center px-8 text-center ${MOBILE_WIDTH_SAFE_CLASS}`}
      >
        <LayoutGrid className="h-9 w-9 text-slate-500" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 text-[15px] font-semibold text-white">{emptyTitle}</p>
        <p className="mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-muted">
          {t("profile.noPostsYetSubtitle")}
        </p>
      </div>
    );
  }

  return (
    <div className={PROFILE_GRID_CLASS}>
      {activeItems.map((post, gridIndex) => {
        const { mediaUrl, mediaType } = getProfilePostMedia(post);
        const spotTitle = getSpotDisplayLabel(post);
        const clickedSpot = viewerItems[gridIndex];
        const isOwner = Boolean(viewerUserId && post.user_id === viewerUserId);
        const isVideo = mediaType === "video" || Boolean(post.video_url?.trim());

        return (
          <article
            key={post.id}
            className="relative aspect-square min-w-0 overflow-hidden bg-slate-950"
          >
            {isOwner ? (
              <div className="pointer-events-auto absolute right-1 top-1 z-30">
                <OwnContentMenu
                  triggerClassName="bg-black/50 backdrop-blur-sm"
                  onEdit={() => setEditPost(post)}
                  onDelete={() => deleteOwnedPublication(post.id, post, viewerUserId!)}
                  onDeleted={() => onPostDeleted?.(post.id)}
                />
              </div>
            ) : null}

            {mediaUrl ? (
              <PostMediaLink
                postId={post.id}
                className="block h-full w-full origin-center transition-transform duration-150 ease-out active:scale-[0.97]"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                onViewerItemDeleted={onPostDeleted}
                viewerMode="profile-feed"
              >
                <ProfileGridTileMedia
                  post={post}
                  postId={post.id}
                  gridPreview={mode === "spots"}
                  fallbackLabel={spotTitle || post.content?.trim() || t("profile.spotFallback")}
                />
              </PostMediaLink>
            ) : (
              <PostMediaLink
                postId={post.id}
                className="flex h-full w-full origin-center items-center justify-center bg-slate-900 px-2 text-center text-xs leading-snug text-slate-300 transition-transform duration-150 ease-out active:scale-[0.97]"
                viewerItems={viewerItems.length > 0 ? viewerItems : undefined}
                clickedSpot={clickedSpot}
                onViewerItemDeleted={onPostDeleted}
                viewerMode="profile-feed"
              >
                <span className="line-clamp-4">{spotTitle || post.content?.trim() || t("profile.spotFallback")}</span>
              </PostMediaLink>
            )}

            {isVideo ? (
              <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                <Play className="h-3.5 w-3.5 fill-white text-white" strokeWidth={0} aria-hidden />
              </span>
            ) : null}
          </article>
        );
      })}

      {editPost && viewerUserId ? (
        <EditPublicationScreen
          isOpen={Boolean(editPost)}
          userId={viewerUserId}
          postId={String(editPost.id)}
          post={editPost}
          onClose={() => setEditPost(null)}
          onSaved={() => {
            setEditPost(null);
            dispatchProfileContentRefresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ProfileGridTileMedia({
  post,
  postId,
  gridPreview,
  fallbackLabel,
}: {
  post: ProfileContentPost;
  postId: string;
  gridPreview: boolean;
  fallbackLabel: string;
}) {
  return (
    <div className="h-full w-full animate-[profile-grid-fade-in_320ms_ease-out]">
      <PostCardMedia
        post={post}
        postId={postId}
        gridPreview={gridPreview}
        className="h-full w-full"
        imageClassName="h-full w-full object-cover"
        fallbackLabel={fallbackLabel}
      />
    </div>
  );
}

type GestureAxis = "undecided" | "x" | "y";

type ProfileContentSwipePagerProps = {
  activeTab: ProfileMainTab;
  onTabChange: (tab: ProfileMainTab) => void;
  onDragProgress?: (progress: number | null) => void;
  postsPage: ReactNode;
  savedPage: ReactNode;
};

function ProfileContentSwipePager({
  activeTab,
  onTabChange,
  onDragProgress,
  postsPage,
  savedPage,
}: ProfileContentSwipePagerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pageIndexRef = useRef(activeTab === "saved" ? 1 : 0);
  const widthRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const axisRef = useRef<GestureAxis>("undecided");
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const samplesRef = useRef<Array<{ t: number; x: number }>>([]);
  const snapTimeoutRef = useRef<number | null>(null);
  const activeTabRef = useRef(activeTab);

  activeTabRef.current = activeTab;

  const measureWidth = useCallback(() => {
    widthRef.current = viewportRef.current?.clientWidth ?? 0;
    return widthRef.current;
  }, []);

  const applyTransform = useCallback((offsetPx: number, withTransition: boolean) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    track.style.transition = withTransition
      ? `transform ${SWIPE_SNAP_MS}ms cubic-bezier(0.25, 0.1, 0.25, 1)`
      : "none";
    track.style.transform = `translate3d(${offsetPx}px, 0, 0)`;
  }, []);

  const settledOffsetForIndex = useCallback(
    (index: number) => {
      const width = measureWidth();
      return -index * width;
    },
    [measureWidth]
  );

  const reportProgress = useCallback(
    (offsetPx: number | null) => {
      if (!onDragProgress) {
        return;
      }

      if (offsetPx == null) {
        onDragProgress(null);
        return;
      }

      const width = widthRef.current || measureWidth();
      if (width <= 0) {
        onDragProgress(null);
        return;
      }

      onDragProgress(Math.min(1, Math.max(0, -offsetPx / width)));
    },
    [measureWidth, onDragProgress]
  );

  const snapToIndex = useCallback(
    (index: number, animate: boolean) => {
      const nextIndex = index <= 0 ? 0 : 1;
      const nextTab: ProfileMainTab = nextIndex === 1 ? "saved" : "spots";
      pageIndexRef.current = nextIndex;
      dragOffsetRef.current = settledOffsetForIndex(nextIndex);
      applyTransform(dragOffsetRef.current, animate);

      if (activeTabRef.current !== nextTab) {
        onTabChange(nextTab);
      }

      onDragProgress?.(null);

      if (snapTimeoutRef.current) {
        window.clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = null;
      }
    },
    [applyTransform, onDragProgress, onTabChange, settledOffsetForIndex]
  );

  // Keep track aligned when tab changes via icon tap (or external state).
  useEffect(() => {
    if (draggingRef.current) {
      return;
    }

    const nextIndex = activeTab === "saved" ? 1 : 0;
    pageIndexRef.current = nextIndex;
    dragOffsetRef.current = settledOffsetForIndex(nextIndex);
    applyTransform(dragOffsetRef.current, true);
    onDragProgress?.(null);
  }, [activeTab, applyTransform, onDragProgress, settledOffsetForIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      measureWidth();
      dragOffsetRef.current = settledOffsetForIndex(pageIndexRef.current);
      applyTransform(dragOffsetRef.current, false);
      return;
    }

    const observer = new ResizeObserver(() => {
      if (draggingRef.current) {
        return;
      }
      measureWidth();
      dragOffsetRef.current = settledOffsetForIndex(pageIndexRef.current);
      applyTransform(dragOffsetRef.current, false);
    });

    observer.observe(viewport);
    measureWidth();
    dragOffsetRef.current = settledOffsetForIndex(pageIndexRef.current);
    applyTransform(dragOffsetRef.current, false);

    return () => observer.disconnect();
  }, [applyTransform, measureWidth, settledOffsetForIndex]);

  useEffect(() => {
    return () => {
      if (snapTimeoutRef.current) {
        window.clearTimeout(snapTimeoutRef.current);
      }
    };
  }, []);

  const pushSample = (x: number, t: number) => {
    const samples = samplesRef.current;
    samples.push({ t, x });
    while (samples.length > 8) {
      samples.shift();
    }
    const windowStart = t - VELOCITY_SAMPLE_WINDOW_MS;
    while (samples.length > 2 && samples[0] && samples[0].t < windowStart) {
      samples.shift();
    }
  };

  const velocityX = () => {
    const samples = samplesRef.current;
    if (samples.length < 2) {
      return 0;
    }
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    const dt = last.t - first.t;
    if (dt <= 0) {
      return 0;
    }
    return (last.x - first.x) / dt;
  };

  const beginGesture = (clientX: number, clientY: number, timeStamp: number, pointerId: number) => {
    if (clientX < 24) {
      return false;
    }

    pointerIdRef.current = pointerId;
    draggingRef.current = false;
    axisRef.current = "undecided";
    startXRef.current = clientX;
    startYRef.current = clientY;
    samplesRef.current = [];
    pushSample(clientX, timeStamp);
    measureWidth();
    return true;
  };

  const moveGesture = (clientX: number, clientY: number, timeStamp: number, event: { preventDefault: () => void }) => {
    if (pointerIdRef.current == null) {
      return;
    }

    const dx = clientX - startXRef.current;
    const dy = clientY - startYRef.current;
    pushSample(clientX, timeStamp);

    if (axisRef.current === "undecided") {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < SWIPE_AXIS_LOCK_PX && absY < SWIPE_AXIS_LOCK_PX) {
        return;
      }

      if (absY > absX) {
        axisRef.current = "y";
        pointerIdRef.current = null;
        return;
      }

      axisRef.current = "x";
      draggingRef.current = true;
      if (viewportRef.current) {
        viewportRef.current.style.touchAction = "none";
      }
    }

    if (axisRef.current !== "x") {
      return;
    }

    event.preventDefault();
    const width = widthRef.current || measureWidth();
    const base = settledOffsetForIndex(pageIndexRef.current);
    let next = base + dx;
    if (next > 0) {
      next = next * 0.35;
    } else if (next < -width) {
      next = -width + (next + width) * 0.35;
    }

    dragOffsetRef.current = next;
    applyTransform(next, false);
    reportProgress(next);
  };

  const finishGesture = () => {
    if (viewportRef.current) {
      viewportRef.current.style.touchAction = "pan-y";
    }

    const wasHorizontal = axisRef.current === "x" && draggingRef.current;
    pointerIdRef.current = null;
    axisRef.current = "undecided";
    draggingRef.current = false;

    if (!wasHorizontal) {
      onDragProgress?.(null);
      return;
    }

    const width = widthRef.current || measureWidth();
    const offset = dragOffsetRef.current;
    const currentIndex = pageIndexRef.current;
    const delta = offset - settledOffsetForIndex(currentIndex);
    const vx = velocityX();

    let nextIndex = currentIndex;
    const passedDistance = Math.abs(delta) >= SWIPE_DISTANCE_PX;
    const passedVelocity = Math.abs(vx) >= SWIPE_VELOCITY_PX_MS;

    if (passedDistance || passedVelocity) {
      const goNext = (passedDistance ? delta < 0 : false) || (passedVelocity ? vx < 0 : false);
      const goPrev = (passedDistance ? delta > 0 : false) || (passedVelocity ? vx > 0 : false);

      if (goNext && !goPrev) {
        nextIndex = Math.min(1, currentIndex + 1);
      } else if (goPrev && !goNext) {
        nextIndex = Math.max(0, currentIndex - 1);
      } else if (vx < 0 || delta < 0) {
        nextIndex = Math.min(1, currentIndex + 1);
      } else {
        nextIndex = Math.max(0, currentIndex - 1);
      }
    } else {
      nextIndex = -offset / Math.max(width, 1) > 0.5 ? 1 : 0;
    }

    snapToIndex(nextIndex, true);
  };

  // Non-passive touch listeners so WKWebView allows preventDefault on horizontal swipes.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0]!;
      beginGesture(touch.clientX, touch.clientY, event.timeStamp, touch.identifier);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pointerIdRef.current == null || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0]!;
      if (touch.identifier !== pointerIdRef.current) {
        return;
      }
      moveGesture(touch.clientX, touch.clientY, event.timeStamp, event);
    };

    const onTouchEnd = () => {
      if (pointerIdRef.current == null && axisRef.current === "undecided") {
        return;
      }
      finishGesture();
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd);
    viewport.addEventListener("touchcancel", onTouchEnd);

    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
    };
    // Intentionally stable: gesture handlers close over refs/callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only touch bindings
  }, [applyTransform, measureWidth, onDragProgress, reportProgress, settledOffsetForIndex, snapToIndex]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (!beginGesture(event.clientX, event.clientY, event.timeStamp, event.pointerId)) {
      return;
    }
    viewportRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    moveGesture(event.clientX, event.clientY, event.timeStamp, event);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId);
    }
    finishGesture();
  };

  const viewportStyle: CSSProperties = {
    touchAction: "pan-y",
    overscrollBehaviorX: "none",
  };

  return (
    <div
      ref={viewportRef}
      className={`relative w-full min-w-0 max-w-full overflow-hidden ${MOBILE_WIDTH_SAFE_CLASS}`}
      style={viewportStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={trackRef}
        className="flex w-[200%] will-change-transform [transform:translate3d(0,0,0)]"
      >
        <div className="w-1/2 min-w-[50%] max-w-[50%] shrink-0 grow-0">{postsPage}</div>
        <div className="w-1/2 min-w-[50%] max-w-[50%] shrink-0 grow-0">{savedPage}</div>
      </div>
    </div>
  );
}

type ProfileContentTabsProps = {
  activeTab: ProfileMainTab;
  onTabChange: (tab: ProfileMainTab) => void;
  personalPosts: ProfileContentPost[];
  spotPosts: ProfileContentPost[];
  loading?: boolean;
  emptyPostsMessage?: string;
  emptySpotsMessage?: string;
  viewerUserId?: string | null;
  onPostDeleted?: (postId: string) => void;
  viewerAuthor?: ViewerPostAuthor | null;
  savedPanel?: ReactNode;
  /** Owner-only Saved tab. Hidden for public profile visitors. */
  showSavedTab?: boolean;
  compact?: boolean;
  /** Stick the tab bar under the profile header (own profile). */
  stickyTabBar?: boolean;
};

export default function ProfileContentTabs({
  activeTab,
  onTabChange,
  personalPosts,
  spotPosts,
  loading = false,
  emptyPostsMessage,
  emptySpotsMessage,
  viewerUserId = null,
  onPostDeleted,
  viewerAuthor = null,
  savedPanel = null,
  showSavedTab = true,
  compact = false,
  stickyTabBar = false,
}: ProfileContentTabsProps) {
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const handleTabChange = useCallback(
    (tab: ProfileMainTab) => {
      setDragProgress(null);
      onTabChange(tab);
    },
    [onTabChange]
  );

  const postsGrid = (
    <ProfilePostsGrid
      mode="spots"
      personalPosts={personalPosts}
      spotPosts={spotPosts}
      loading={loading}
      emptyPostsMessage={emptyPostsMessage}
      emptySpotsMessage={emptySpotsMessage}
      viewerUserId={viewerUserId}
      onPostDeleted={onPostDeleted}
      viewerAuthor={viewerAuthor}
    />
  );

  if (!showSavedTab) {
    return (
      <div className={`w-full min-w-0 max-w-full space-y-0 overflow-x-hidden ${MOBILE_WIDTH_SAFE_CLASS}`}>
        {postsGrid}
      </div>
    );
  }

  const tabBar = (
    <ProfileContentTabBar
      activeTab={activeTab}
      onTabChange={handleTabChange}
      progress={dragProgress ?? undefined}
      compact={compact}
    />
  );

  return (
    <div className={`w-full min-w-0 max-w-full space-y-0 overflow-x-hidden ${MOBILE_WIDTH_SAFE_CLASS}`}>
      {stickyTabBar ? (
        <div className="sticky top-0 z-20 border-b border-white/5 bg-[#050816]/95 backdrop-blur-md supports-[backdrop-filter]:bg-[#050816]/80">
          {tabBar}
        </div>
      ) : (
        tabBar
      )}

      <ProfileContentSwipePager
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onDragProgress={setDragProgress}
        postsPage={postsGrid}
        savedPage={<div className={MOBILE_WIDTH_SAFE_CLASS}>{savedPanel}</div>}
      />
    </div>
  );
}
