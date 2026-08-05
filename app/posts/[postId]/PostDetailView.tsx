"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import SpotLocationSummary from "@/components/SpotLocationSummary";
import { useSpotLocationModal } from "@/components/SpotLocationModalProvider";
import GuidePlaceCard from "@/components/GuidePlaceCard";
import LocationCardViewerFrame from "@/components/LocationCardViewerFrame";
import PublicationAuthorHeader from "@/components/PublicationAuthorHeader";
import OwnContentMenu from "@/components/OwnContentMenu";
import EditPublicationScreen from "@/components/EditPublicationScreen";
import PostCommentsSection from "@/components/PostCommentsSection";
import PostDetailActionRail from "@/components/PostDetailActionRail";
import PostReelMedia from "@/components/PostReelMedia";
import SpotMediaCarousel, { type SpotCarouselSlide } from "@/components/SpotMediaCarousel";
import SpotViewerCarouselIndicator from "@/components/SpotViewerCarouselIndicator";
import SendSpotSheet from "@/components/SendSpotSheet";
import PostMediaViewer from "@/components/PostMediaViewer";
import { loadPostMediaCarouselItems } from "@/lib/postMediaItems";
import { deleteOwnedPublication } from "@/lib/deleteContent";
import {
  formatPostDetailSpotTitle,
  loadPostDetail,
  type PostDetailRow,
} from "@/lib/postDetail";
import { getCachedPostDetail } from "@/lib/postDetailCache";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { isGuideAccountProfile } from "@/lib/guideAccounts";
import { normalizePostId } from "@/lib/postIds";
import { loadPostReactions, type PostReactionState } from "@/lib/postReactions";
import {
  formatPostTime,
  getPostMedia,
  getPostThumbnailUrl,
  inferMediaTypeFromUrl,
} from "@/lib/posts";
import { normalizeGuidePlace } from "@/lib/guidePlaces";
import { publicProfileUsername } from "@/lib/publicProfile";
import { navigateBack } from "@/lib/navigateBack";
import { getErrorMessage, logExactLoadError } from "@/lib/safeLoad";
import { perfMark, perfSince } from "@/lib/perfLog";
import { shouldShowSpotLocation, isSpotContent } from "@/lib/spotLocationDisplay";
import { getSpotCaption } from "@/lib/spotCaption";
import { isSpotLocationCardPost, getSpotLocationCardViewerTitle, probeImageAspectRatio } from "@/lib/spotLocationCard";
import { normalizeSpotPublicStats, EMPTY_SPOT_PUBLIC_STATS, type SpotPublicStats } from "@/lib/spotRanking";
import { dispatchSpotStatsUpdated, SPOT_STATS_UPDATED_EVENT, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";
import { recordSpotUniqueView } from "@/lib/spotUniqueViews";
import {
  isSpotSavedByUser,
  SPOT_SAVE_CHANGED_EVENT,
  toggleSpotSave,
  type SpotSaveChangedDetail,
} from "@/lib/savedSpots";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { useSpotViewerDismissGesture } from "@/lib/useSpotViewerDismissGesture";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { seeSpotLocation } from "@/lib/seeSpotLocation";
import { type SpotLoadPhase } from "@/lib/spotLoadState";

const REEL_ICON_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/70";

const EMPTY_REACTIONS: PostReactionState = {
  likeCount: 0,
  usefulCount: 0,
  userLiked: false,
  userMarkedUseful: false,
};

function ShimmerBlock({ className }: { className: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-800/70 before:absolute before:inset-0 before:-translate-x-full before:animate-[spotdrop-shimmer_1.35s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent ${className}`}
    />
  );
}

function PostDetailSkeleton() {
  return (
    <div className="absolute inset-0 bg-black">
      <ShimmerBlock className="absolute inset-0 bg-slate-900" />
      <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-28 pr-16">
        <ShimmerBlock className="mb-3 h-8 w-8 rounded-full" />
        <ShimmerBlock className="mb-2 h-4 w-40 rounded-full" />
        <ShimmerBlock className="h-3 w-56 rounded-full" />
      </div>
      <div className="absolute bottom-28 right-2 z-10 flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <ShimmerBlock key={`rail-skeleton-${index}`} className="h-10 w-10 rounded-full" />
        ))}
      </div>
      <style jsx>{`
        @keyframes spotdrop-shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

function getDetailMedia(post: PostDetailRow): {
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
} {
  if (post.media_url) {
    if (post.media_type === "video") {
      return { mediaUrl: post.media_url, mediaType: "video" };
    }

    if (post.media_type === "image") {
      return { mediaUrl: post.media_url, mediaType: "image" };
    }

    const inferred = inferMediaTypeFromUrl(post.media_url);

    return {
      mediaUrl: post.media_url,
      mediaType: inferred ?? "image",
    };
  }

  const media = getPostMedia(post);

  return {
    mediaUrl: media.mediaUrl,
    mediaType: media.mediaType === "video" ? "video" : media.mediaType === "image" ? "image" : null,
  };
}

function resolveRoutePostId(params: { postId?: string | string[] }) {
  const raw = params.postId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const decoded = value ? decodeURIComponent(value) : "";
  return normalizePostId(decoded) ?? "";
}

type PostDetailPageProps = {
  postIdOverride?: string;
};

export default function PostDetailPage({ postIdOverride }: PostDetailPageProps = {}) {
  const router = useRouter();
  const params = useParams<{ postId?: string | string[] }>();
  const postId = postIdOverride ?? resolveRoutePostId(params);
  const { t, locale } = useI18n();
  const { openSpotLocation } = useSpotLocationModal();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;

  const [post, setPost] = useState<PostDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const [engagementReady, setEngagementReady] = useState(false);
  const [reactions, setReactions] = useState<PostReactionState>(EMPTY_REACTIONS);
  const [reactionsLoading, setReactionsLoading] = useState(false);
  const [reactionsError, setReactionsError] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const [commentCount, setCommentCount] = useState(0);
  const [spotStats, setSpotStats] = useState<SpotPublicStats>(EMPTY_SPOT_PUBLIC_STATS);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [sendSpotSheetOpen, setSendSpotSheetOpen] = useState(false);
  const [editPublicationOpen, setEditPublicationOpen] = useState(false);
  const [isSpotSaved, setIsSpotSaved] = useState(false);
  const [saveStateLoading, setSaveStateLoading] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [mounted, setMounted] = useState(false);
  const [mediaLoadPhase, setMediaLoadPhase] = useState<SpotLoadPhase>("loading");
  const [carouselSlides, setCarouselSlides] = useState<SpotCarouselSlide[]>([]);
  const [carouselActiveIndex, setCarouselActiveIndex] = useState(0);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mediaMountAtRef = useRef<number | null>(null);

  const handleMediaPhaseChange = useCallback(
    (phase: SpotLoadPhase) => {
      setMediaLoadPhase(phase);

      if (phase === "loaded" && mediaMountAtRef.current != null) {
        perfSince(mediaMountAtRef.current, "first media frame", { postId });
        mediaMountAtRef.current = null;
      }
    },
    [postId]
  );

  useLayoutEffect(() => {
    setMounted(true);
    perfMark("post-detail");
  }, []);

  useEffect(() => {
    const openComments =
      searchParams.get("comments") === "1" || Boolean(searchParams.get("commentId"));
    const commentId = searchParams.get("commentId")?.trim() || null;

    if (!openComments) {
      return;
    }

    setCommentsOpen(true);
    setHighlightCommentId(commentId);
  }, [searchParams]);

  useEffect(() => {
    setImmersiveOverlayActive(true);

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const previousBodyPosition = document.body.style.position;
    const previousBodyWidth = document.body.style.width;
    const previousBodyTop = document.body.style.top;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.top = `-${scrollY}px`;

    return () => {
      setImmersiveOverlayActive(false);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      document.body.style.position = previousBodyPosition;
      document.body.style.width = previousBodyWidth;
      document.body.style.top = previousBodyTop;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, [postId]);

  useEffect(() => {
    let cancelled = false;

    const loadPostOnly = async () => {
      const mountAt = performance.now();
      setLoading(true);
      setError(null);
      setPost(null);
      setMediaLoadPhase("loading");
      mediaMountAtRef.current = performance.now();
      setEngagementReady(false);
      setReactions(EMPTY_REACTIONS);
      setReactionsError(null);
      setCommentCount(0);
      setSpotStats(EMPTY_SPOT_PUBLIC_STATS);
      setCommentsOpen(false);
      setIsSpotSaved(false);
      setSaveToast(null);

      if (!postId) {
        setError("Post not found.");
        setLoading(false);
        return;
      }

      const cached = getCachedPostDetail(postId);

      if (cached?.post) {
        const cachedPost = cached.post;
        setPost({
          ...cachedPost,
          spot_latitude: cachedPost.spot_latitude != null ? Number(cachedPost.spot_latitude) : null,
          spot_longitude: cachedPost.spot_longitude != null ? Number(cachedPost.spot_longitude) : null,
        });
        setIsDemo(cached.isDemo);
        if (cachedPost.content_kind === "spot") {
          const stats = normalizeSpotPublicStats(cachedPost);
          setSpotStats(stats);
          setCommentCount(stats.comments_count);
        }
        setLoading(false);
        setEngagementReady(true);
        perfSince(mountAt, "first data received", { postId, source: "cache" });
      }

      try {
        const result = await loadPostDetail(postId);

        if (cancelled) {
          return;
        }

        if (result.error || !result.post) {
          if (!cached?.post) {
            setError(result.error ?? "Post not found.");
            setLoading(false);
          }
          return;
        }

        const row = result.post;

        if (isGuideAccountProfile(row.profiles)) {
          setError("Post not found.");
          setLoading(false);
          return;
        }

        setPost({
          ...row,
          spot_latitude: row.spot_latitude != null ? Number(row.spot_latitude) : null,
          spot_longitude: row.spot_longitude != null ? Number(row.spot_longitude) : null,
        });
        if (row.content_kind === "spot") {
          const stats = normalizeSpotPublicStats(row);
          setSpotStats(stats);
          setCommentCount(stats.comments_count);
        }
        setIsDemo(result.isDemo);
        setLoading(false);
        setEngagementReady(true);
        perfSince(mountAt, "first data received", { postId, source: cached?.post ? "network-refresh" : "network" });
      } catch (loadError) {
        logExactLoadError(loadError);

        if (cancelled) {
          return;
        }

        if (!cached?.post) {
          setError(getErrorMessage(loadError, "Unable to load this post."));
          setLoading(false);
        }
      }
    };

    void loadPostOnly();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    if (!engagementReady || isDemo || !postId) {
      return;
    }

    let cancelled = false;

    const loadReactions = async () => {
      setReactionsLoading(true);
      setReactionsError(null);

      try {
        const result = await loadPostReactions(postId, userId);

        if (cancelled) {
          return;
        }

        setReactions(result.data);
        setReactionsError(result.error);
      } catch (reactionsError) {
        logExactLoadError(reactionsError);

        if (cancelled) {
          return;
        }

        const msg =
          reactionsError instanceof Error && reactionsError.message.trim() ? reactionsError.message.trim() : null;
        setReactionsError(msg);
      } finally {
        if (!cancelled) {
          setReactionsLoading(false);
        }
      }
    };

    void loadReactions();

    return () => {
      cancelled = true;
    };
  }, [engagementReady, isDemo, postId, userId]);

  useEffect(() => {
    if (!postId) {
      setCarouselSlides([]);
      setCarouselActiveIndex(0);
      return;
    }

    let cancelled = false;

    void loadPostMediaCarouselItems(postId).then((items) => {
      if (cancelled) {
        return;
      }

      if (items.length <= 1) {
        setCarouselSlides([]);
        setCarouselActiveIndex(0);
        return;
      }

      setCarouselActiveIndex(0);
      setCarouselSlides(
        items.map((entry) => ({
          id: entry.id,
          mediaUrl: entry.media_url,
          mediaType: entry.media_type,
          posterUrl: entry.video_cover_url,
          audioMuted: entry.audio_muted,
        }))
      );
    });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const isSpotPost = post
    ? isSpotContent({
        content_kind: post.content_kind,
        spot_latitude: post.spot_latitude,
        spot_longitude: post.spot_longitude,
      })
    : false;

  useEffect(() => {
    if (!engagementReady || loading || error || isDemo || !isSpotPost || !postId || !post?.user_id) {
      return;
    }

    void recordSpotUniqueView({
      spotId: postId,
      ownerId: post.user_id,
      viewerId: userId,
    });
  }, [engagementReady, loading, error, isDemo, isSpotPost, postId, post?.user_id, userId]);

  useEffect(() => {
    if (!engagementReady || isDemo || !isSpotPost || !postId || !userId) {
      setIsSpotSaved(false);
      return;
    }

    let cancelled = false;

    const loadSaveState = async () => {
      setSaveStateLoading(true);

      try {
        const result = await isSpotSavedByUser(userId, postId);

        if (cancelled) {
          return;
        }

        setIsSpotSaved(result.saved);

        if (result.error) {
          console.error("[PostDetailPage] isSpotSavedByUser failed:", result.error);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("[PostDetailPage] isSpotSavedByUser threw:", loadError);
        }
      } finally {
        if (!cancelled) {
          setSaveStateLoading(false);
        }
      }
    };

    void loadSaveState();

    return () => {
      cancelled = true;
    };
  }, [engagementReady, isDemo, isSpotPost, postId, userId]);

  useEffect(() => {
    const handleSaveChanged = (event: Event) => {
      const detail = (event as CustomEvent<SpotSaveChangedDetail>).detail;

      if (!detail?.postId || !postId || detail.postId !== postId) {
        return;
      }

      setIsSpotSaved(detail.saved);

      if (typeof detail.savedCount === "number") {
        setSpotStats((current) => ({ ...current, saved_count: detail.savedCount! }));
      }
    };

    window.addEventListener(SPOT_SAVE_CHANGED_EVENT, handleSaveChanged);

    return () => {
      window.removeEventListener(SPOT_SAVE_CHANGED_EVENT, handleSaveChanged);
    };
  }, [postId]);

  useEffect(() => {
    if (!saveToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSaveToast(null), 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [saveToast]);

  useEffect(() => {
    const handleStatsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SpotStatsUpdatedDetail>).detail;

      if (!detail?.postId || detail.postId !== postId) {
        return;
      }

      setSpotStats((current) => ({
        visited_count: detail.visited_count ?? current.visited_count,
        comments_count: detail.comments_count ?? current.comments_count,
        saved_count: detail.saved_count ?? current.saved_count,
      }));

      if (detail.comments_count != null) {
        setCommentCount(detail.comments_count);
      }
    };

    window.addEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);

    return () => {
      window.removeEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);
    };
  }, [postId]);

  const handleRequireAuth = () => {
    setAuthHint("Sign in to save or comment.");
  };

  const handleToggleSave = async () => {
    if (!userId) {
      handleRequireAuth();
      return;
    }

    if (!postId || !isSpotPost || savePending || isDemo || !engagementReady) {
      return;
    }

    const previousSaved = isSpotSaved;
    const previousCount = spotStats.saved_count;
    const nextSaved = !previousSaved;

    setIsSpotSaved(nextSaved);
    setSpotStats((current) => ({
      ...current,
      saved_count: Math.max(0, current.saved_count + (nextSaved ? 1 : -1)),
    }));
    setSavePending(true);

    const result = await toggleSpotSave(userId, postId);

    setSavePending(false);

    if (result.error) {
      setIsSpotSaved(previousSaved);
      setSpotStats((current) => ({ ...current, saved_count: previousCount }));
      return;
    }

    setIsSpotSaved(result.saved);

    if (typeof result.savedCount === "number") {
      setSpotStats((current) => ({ ...current, saved_count: result.savedCount! }));
    }

    setSaveToast(result.saved ? t("postDetail.savedToast") : t("postDetail.unsavedToast"));
  };

  const handleNavigateBack = useCallback(() => {
    navigateBack(router, "/feed");
  }, [router]);

  const getCarouselGestureState = useCallback(() => {
    if (carouselSlides.length <= 1) {
      return null;
    }

    return {
      itemCount: carouselSlides.length,
      activeIndex: carouselActiveIndex,
    };
  }, [carouselActiveIndex, carouselSlides.length]);

  const {
    isClosing,
    panelStyle,
    screenStyle,
    requestClose,
  } = useSpotViewerDismissGesture({
    onClose: handleNavigateBack,
    targetRef: screenRef,
    panelRef,
    isActive: mounted,
    getCarouselGestureState,
  });

  const { mediaUrl, mediaType } = post ? getDetailMedia(post) : { mediaUrl: null, mediaType: null };
  const posterUrl = post ? getPostThumbnailUrl(post) : null;

  useEffect(() => {
    if (!mediaUrl || mediaType !== "image") {
      setMediaAspectRatio(null);
      return;
    }

    let cancelled = false;

    void probeImageAspectRatio(mediaUrl).then((ratio) => {
      if (!cancelled) {
        setMediaAspectRatio(ratio);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mediaUrl, mediaType]);

  const hasCarousel = carouselSlides.length > 1;
  const postAuthor = post?.profiles;
  const authorUsername = publicProfileUsername(postAuthor?.username);
  const guidePlace = normalizeGuidePlace(post?.guide_places);
  const spotTitle = post ? formatPostDetailSpotTitle(post) : null;
  const showSpotLocation = post
    ? shouldShowSpotLocation({
        content_kind: post.content_kind,
        spot_name: post.spot_name,
        spot_address: post.spot_address,
        spot_city: post.spot_city,
        spot_country: post.spot_country,
        spot_latitude: post.spot_latitude,
        spot_longitude: post.spot_longitude,
      })
    : false;
  const isLocationCard = post ? isSpotLocationCardPost(post, {
    carouselItemCount: carouselSlides.length,
    mediaAspectRatio,
  }) : false;
  const showSpotLocationInViewer = showSpotLocation;
  const viewerCaption = post ? getSpotCaption(post.content) : null;
  const viewerTitle = post && isLocationCard ? getSpotLocationCardViewerTitle(post, locale) : null;
  const mediaAlt = viewerCaption ?? viewerTitle ?? spotTitle ?? "";
  const engagementDisabled = isDemo || !engagementReady;
  const showViewerContent = Boolean(post && (!loading || isClosing) && !error);
  const showActionRail = showViewerContent;
  const showSkeleton = loading && !isClosing;
  const isOwnPost = Boolean(post && userId && post.user_id === userId && !isDemo);

  const handleOpenSpotLocation = () => {
    if (!post || !showSpotLocation) {
      return;
    }

    seeSpotLocation({
      location: {
        id: post.id,
        user_id: post.user_id,
        content_kind: post.content_kind,
        spot_name: post.spot_name,
        spot_address: post.spot_address,
        spot_city: post.spot_city,
        spot_country: post.spot_country,
        spot_latitude: post.spot_latitude,
        spot_longitude: post.spot_longitude,
      },
      viewerId: userId,
      ownerId: post.user_id,
      authResolved: engagementReady,
      currentVisitedCount: spotStats.visited_count,
      openSpotLocation,
    });
  };

  const resolvedShareUrl = useMemo(() => {
    if (shareUrl) {
      return shareUrl;
    }

    return `/posts/${postId}`;
  }, [postId, shareUrl]);

  const immersiveView = (
    <div
      ref={screenRef}
      data-spot-reel-screen
      data-spot-viewer-screen
      data-spot-viewer-closing={isClosing ? "" : undefined}
      className="fixed inset-0 z-[120] overflow-hidden text-white"
      style={screenStyle}
    >
      <div ref={panelRef} data-spot-viewer-panel style={panelStyle}>
      <button
        type="button"
        onClick={requestClose}
        className={`absolute left-3 z-50 ${REEL_ICON_BUTTON_CLASS}`}
        data-spot-viewer-chrome-top
        aria-label={t("post.goBack")}
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>

      {isOwnPost && post ? (
        <div
          className="pointer-events-auto absolute right-3 z-50"
          data-spot-viewer-chrome-top
          onClick={(event) => event.stopPropagation()}
        >
          <OwnContentMenu
            triggerClassName="bg-black/50 ring-1 ring-white/15 backdrop-blur-md hover:bg-black/70"
            deleteMenuLabel={t("content.deletePublication")}
            editMenuLabel={t("content.editPublication")}
            confirmTitle={t("content.deletePublicationTitle")}
            confirmBody={t("content.deletePublicationBody")}
            deletedToast={t("content.spotDeleted")}
            onEdit={() => setEditPublicationOpen(true)}
            onDelete={async () => {
              if (!userId || !post) {
                return { ok: false, error: "Sign in required." };
              }

              setSendSpotSheetOpen(false);
              return deleteOwnedPublication(String(post.id), post, userId);
            }}
            onDeleted={() => {
              navigateBack(router, "/profile");
            }}
          />
        </div>
      ) : null}

      {showSkeleton ? (
        <PostDetailSkeleton />
      ) : !showViewerContent ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-red-300">{localizeUserMessage(t, error) ?? t("post.notFound")}</p>
          <button
            type="button"
            onClick={handleNavigateBack}
            className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          >
            {t("post.goBack")}
          </button>
        </div>
      ) : post ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            {guidePlace && !mediaUrl ? (
              <div className="absolute inset-0 z-[1] flex items-center justify-center overflow-y-auto px-4 pb-36 pt-[max(3.5rem,env(safe-area-inset-top,0px))]">
                <div className="w-full max-w-md">
                  <GuidePlaceCard place={guidePlace} postId={post.id} />
                </div>
              </div>
            ) : isLocationCard && mediaUrl && mediaType && isSpotPost ? (
              <LocationCardViewerFrame>
                <PostReelMedia
                  mediaUrl={mediaUrl}
                  mediaType={mediaType}
                  posterUrl={posterUrl}
                  isActive
                  audioMuted={Boolean(post.audio_muted)}
                  alt={mediaAlt}
                  onPhaseChange={handleMediaPhaseChange}
                />
              </LocationCardViewerFrame>
            ) : hasCarousel && isSpotPost ? (
              <div data-spot-viewer-media className="absolute inset-0">
                <SpotMediaCarousel
                  slides={carouselSlides}
                  isActive
                  activeIndex={carouselActiveIndex}
                  onActiveIndexChange={setCarouselActiveIndex}
                  viewerPlayback
                  className="h-full w-full"
                />
              </div>
            ) : mediaUrl && mediaType && isSpotPost ? (
              <div data-spot-viewer-media data-media-load-phase={mediaLoadPhase}>
                <PostReelMedia
                  mediaUrl={mediaUrl}
                  mediaType={mediaType}
                  posterUrl={posterUrl}
                  isActive
                  audioMuted={Boolean(post.audio_muted)}
                  alt={mediaAlt}
                  onPhaseChange={handleMediaPhaseChange}
                />
              </div>
            ) : mediaUrl && mediaType ? (
              <div data-spot-viewer-media>
                <PostMediaViewer mediaUrl={mediaUrl} mediaType={mediaType} alt={mediaAlt} />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-500">
                {t("post.noMedia")}
              </div>
            )}

            {showActionRail ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-28 pr-16">
                <div className="pointer-events-auto relative space-y-2">
                  {!isLocationCard && hasCarousel ? (
                    <SpotViewerCarouselIndicator
                      slides={carouselSlides}
                      activeIndex={carouselActiveIndex}
                      showSwipeHint
                      onSelectIndex={setCarouselActiveIndex}
                    />
                  ) : null}
                  {postAuthor ? (
                    <PublicationAuthorHeader
                      authorUserId={post.user_id}
                      authorUsername={authorUsername}
                      authorIsVerified={postAuthor.is_verified}
                      avatarUrl={postAuthor.avatar_url}
                      viewerUserId={userId}
                    />
                  ) : null}

                  {viewerTitle ? (
                    <p className="text-sm font-semibold text-white">
                      {viewerTitle}
                    </p>
                  ) : null}

                  {viewerCaption ? (
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white">{viewerCaption}</p>
                  ) : null}

                  {showSpotLocationInViewer && post ? (
                    <SpotLocationSummary
                      className="text-xs"
                      currentVisitedCount={spotStats.visited_count}
                      location={{
                        id: post.id,
                        user_id: post.user_id,
                        content_kind: post.content_kind,
                        spot_name: post.spot_name,
                        spot_address: post.spot_address,
                        spot_city: post.spot_city,
                        spot_country: post.spot_country,
                        spot_latitude: post.spot_latitude,
                        spot_longitude: post.spot_longitude,
                      }}
                    />
                  ) : null}

                  <time
                    className="block text-xs text-slate-500"
                    dateTime={post.created_at}
                  >
                    {formatPostTime(post.created_at)}
                  </time>

                  {!isLocationCard && isDemo ? (
                    <p className="text-xs text-slate-500">{t("post.guidePreviewReadOnly")}</p>
                  ) : !isLocationCard && authHint ? (
                    <p className="text-xs text-amber-200/90">{localizeUserMessage(t, authHint) ?? authHint}</p>
                  ) : null}

                  {!isLocationCard && reactionsError ? (
                    <p className="text-xs text-red-300">{localizeUserMessage(t, reactionsError) ?? reactionsError}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showActionRail ? (
              <div
                className="pointer-events-auto absolute bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] right-2 z-30"
                onClick={(event) => event.stopPropagation()}
              >
                <PostDetailActionRail
                  postId={postId}
                  userId={userId}
                  reactions={reactions}
                  commentCount={commentCount}
                  shareUrl={resolvedShareUrl}
                  disabled={engagementDisabled || reactionsLoading}
                  variant={isSpotPost ? "spot" : "default"}
                  isSpotSaved={isSpotSaved}
                  savedCount={spotStats.saved_count}
                  visitedCount={spotStats.visited_count}
                  savePending={(saveStateLoading || savePending) && isSpotPost}
                  onRequireAuth={handleRequireAuth}
                  onCommentClick={() => setCommentsOpen(true)}
                  onSaveClick={() => void handleToggleSave()}
                  onVisitedClick={isSpotPost && showSpotLocation ? handleOpenSpotLocation : undefined}
                  onSendSpotClick={isSpotPost ? () => setSendSpotSheetOpen(true) : undefined}
                />
              </div>
            ) : null}

            {guidePlace && mediaUrl ? (
              <div
                className="absolute left-4 right-16 z-20 max-h-24 overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md"
                style={{ top: "max(4rem, calc(env(safe-area-inset-top, 0px) + 2.5rem))" }}
              >
                <GuidePlaceCard place={guidePlace} postId={post.id} />
              </div>
            ) : null}
          </div>

          {!engagementDisabled ? (
            <PostCommentsSection
              postId={postId}
              userId={userId}
              disabled={engagementDisabled}
              onRequireAuth={handleRequireAuth}
              mode="drawer"
              drawerOpen={commentsOpen}
              onDrawerClose={() => {
                setCommentsOpen(false);
                setHighlightCommentId(null);
              }}
              highlightCommentId={highlightCommentId}
              uniqueCommentersCount={isSpotPost}
              initialCommentCount={commentCount}
              skipInitialCountFetch={isSpotPost}
              onCountChange={(count) => {
                setCommentCount(count);
                if (isSpotPost) {
                  setSpotStats((current) => ({ ...current, comments_count: count }));
                  dispatchSpotStatsUpdated({ postId, comments_count: count });
                }
              }}
            />
          ) : null}

          {saveToast ? (
            <div className="pointer-events-none absolute inset-x-0 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.25rem))] z-40 flex justify-center px-4">
              <p className="rounded-full bg-black/70 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md">
                {saveToast}
              </p>
            </div>
          ) : null}

          {isSpotPost && sendSpotSheetOpen && post?.id ? (
            <SendSpotSheet
              postId={post.id}
              userId={userId}
              shareUrl={resolvedShareUrl}
              isOpen={sendSpotSheetOpen}
              onClose={() => setSendSpotSheetOpen(false)}
              onRequireAuth={handleRequireAuth}
            />
          ) : null}

          {isOwnPost && userId && post ? (
            <EditPublicationScreen
              isOpen={editPublicationOpen}
              userId={userId}
              postId={String(post.id)}
              post={post}
              onClose={() => setEditPublicationOpen(false)}
              onSaved={(next) => {
                setPost((current) =>
                  current
                    ? {
                        ...current,
                        content: next.content ?? current.content,
                        spot_name: next.spot_name ?? current.spot_name,
                      }
                    : current
                );
              }}
            />
          ) : null}
        </>
      ) : null}
      </div>
    </div>
  );

  if (!mounted) {
    return null;
  }

  return createPortal(immersiveView, document.body);
}
