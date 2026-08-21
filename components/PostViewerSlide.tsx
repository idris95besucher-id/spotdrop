"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import EditPublicationScreen from "@/components/EditPublicationScreen";
import PublicationAuthorHeader from "@/components/PublicationAuthorHeader";
import OwnContentMenu from "@/components/OwnContentMenu";
import { useSpotLocationModal } from "@/components/SpotLocationModalProvider";
import PostCommentsSection from "@/components/PostCommentsSection";
import PostDetailActionRail from "@/components/PostDetailActionRail";
import SendSpotSheet from "@/components/SendSpotSheet";
import PostReelMedia, { type ReelMediaPreload } from "@/components/PostReelMedia";
import SpotMediaCarousel, { type SpotCarouselSlide } from "@/components/SpotMediaCarousel";
import SpotViewerCarouselIndicator from "@/components/SpotViewerCarouselIndicator";
import GuidePlaceCard from "@/components/GuidePlaceCard";
import LocationCardViewerFrame from "@/components/LocationCardViewerFrame";
import PostCaptionTranslate from "@/components/PostCaptionTranslate";
import SpotLocationSummary from "@/components/SpotLocationSummary";
import { deleteOwnedPublication } from "@/lib/deleteContent";
import { isDemoPostId, postIdsEqual } from "@/lib/postIds";
import {
  findDemoPost,
  formatPostDetailSpotTitle,
  loadPostDetail,
  type PostDetailRow,
} from "@/lib/postDetail";
import { loadPostReactions, type PostReactionState } from "@/lib/postReactions";
import { formatPostTime } from "@/lib/posts";
import { loadPostMediaCarouselItems } from "@/lib/postMediaItems";
import { getReelMediaSources } from "@/lib/postViewerMedia";
import { publicProfileUsername } from "@/lib/publicProfile";
import { normalizeGuidePlace } from "@/lib/guidePlaces";
import { isSpotContent, shouldShowSpotLocation } from "@/lib/spotLocationDisplay";
import { getSpotCaption } from "@/lib/spotCaption";
import { isSpotLocationCardPost, getSpotLocationCardViewerTitle, probeImageAspectRatio } from "@/lib/spotLocationCard";
import { normalizeSpotPublicStats, type SpotPublicStats } from "@/lib/spotRanking";
import { SPOT_STATS_UPDATED_EVENT, dispatchSpotStatsUpdated, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";
import { seeSpotLocation } from "@/lib/seeSpotLocation";
import {
  isSpotSavedByUser,
  SPOT_SAVE_CHANGED_EVENT,
  toggleSpotSave,
  type SpotSaveChangedDetail,
} from "@/lib/savedSpots";
import { getViewerSpotMediaUrl, type ViewerPostListItem } from "@/lib/postViewer";
import { perfLog, perfSince } from "@/lib/perfLog";
import { useI18n } from "@/components/I18nProvider";
import { logSpotLoadUiFailure } from "@/lib/spotLoadDiagnostics";
import {
  SPOT_DETAIL_FETCH_TIMEOUT_MS,
  SPOT_LOAD_ERROR,
  type SpotLoadPhase,
} from "@/lib/spotLoadState";
import { recordSpotUniqueView } from "@/lib/spotUniqueViews";

function itemHasPreviewMedia(item: ViewerPostListItem) {
  const sources = getReelMediaSources(item);

  return Boolean(
    getViewerSpotMediaUrl(item) ||
    sources.posterUrl ||
    (sources.mediaUrl && sources.mediaType)
  );
}

const EMPTY_REACTIONS: PostReactionState = {
  likeCount: 0,
  usefulCount: 0,
  userLiked: false,
  userMarkedUseful: false,
};

type PostViewerSlideProps = {
  item: ViewerPostListItem;
  isActive: boolean;
  shouldPreloadMedia?: boolean;
  slideIndex: number;
  userId: string | null;
  onItemDeleted?: (postId: string) => void;
  onActiveMediaLoadingChange?: (loading: boolean) => void;
  onCarouselGestureStateChange?: (
    state: { itemCount: number; activeIndex: number } | null
  ) => void;
  /** Search Spot only — see VerticalPostViewer.closeBeforeAuthorProfileNavigation. */
  closeBeforeAuthorProfileNavigation?: boolean;
  /** Hides the Search Spot overlay (keeps it mounted) before opening the author profile. */
  onSuspendForAuthorProfileNavigation?: (authorUserId: string) => void;
  /** Search Spot only — Instagram-style spring-back pinch zoom on photos. */
  enableImagePinchZoom?: boolean;
};

function previewToPost(item: ViewerPostListItem): PostDetailRow {
  return {
    id: item.id,
    user_id: item.user_id,
    content: item.content ?? "",
    created_at: item.created_at,
    content_kind: item.content_kind,
    image_url: item.image_url,
    video_url: item.video_url,
    video_cover_url: item.video_cover_url,
    thumbnail_url: item.thumbnail_url,
    media_url: item.media_url,
    media_type: item.media_type,
    spot_name: item.spot_name,
    spot_address: item.spot_address,
    spot_city: item.spot_city,
    spot_country: item.spot_country,
    spot_latitude: item.spot_latitude,
    spot_longitude: item.spot_longitude,
    visibility: item.visibility ?? null,
    profiles: item.profiles ?? null,
  };
}

export default function PostViewerSlide({
  item,
  isActive,
  shouldPreloadMedia = false,
  slideIndex,
  userId,
  onItemDeleted,
  onActiveMediaLoadingChange,
  onCarouselGestureStateChange,
  closeBeforeAuthorProfileNavigation = false,
  onSuspendForAuthorProfileNavigation,
  enableImagePinchZoom = false,
}: PostViewerSlideProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [post, setPost] = useState<PostDetailRow>(() => previewToPost(item));
  const [detailLoadPhase, setDetailLoadPhase] = useState<SpotLoadPhase>("loading");
  const [detailError, setDetailError] = useState<string | null>(null);
  /** True only after loadPostDetail returned a real spot row (not preview-only fallback). */
  const [detailFetchedOk, setDetailFetchedOk] = useState(false);
  const [isDemo, setIsDemo] = useState(() => isDemoPostId(item.id));

  const [reactions, setReactions] = useState<PostReactionState>(EMPTY_REACTIONS);
  const [reactionsLoading, setReactionsLoading] = useState(false);
  const [reactionsError, setReactionsError] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [commentCount, setCommentCount] = useState(item.comments_count ?? 0);
  const [spotStats, setSpotStats] = useState<SpotPublicStats>(() =>
    normalizeSpotPublicStats(item)
  );
  const [carouselSlides, setCarouselSlides] = useState<SpotCarouselSlide[]>([]);
  const [carouselActiveIndex, setCarouselActiveIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [sendSpotSheetOpen, setSendSpotSheetOpen] = useState(false);
  const [editPublicationOpen, setEditPublicationOpen] = useState(false);
  const [isSpotSaved, setIsSpotSaved] = useState(false);
  const [saveStateLoading, setSaveStateLoading] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
  const isSpot = isSpotContent({
    content_kind: post.content_kind,
    spot_latitude: post.spot_latitude,
    spot_longitude: post.spot_longitude,
  });
  const { openSpotLocation } = useSpotLocationModal();

  useEffect(() => {
    setPost(previewToPost(item));
    setDetailLoadPhase("loading");
    setDetailError(null);
    setDetailFetchedOk(false);
    setIsDemo(isDemoPostId(item.id));
    setReactions(EMPTY_REACTIONS);
    setCommentsOpen(false);
    setSendSpotSheetOpen(false);
    setEditPublicationOpen(false);
    setIsSpotSaved(false);
    setSaveToast(null);
    setCommentCount(item.comments_count ?? 0);
    setSpotStats(normalizeSpotPublicStats(item));
    setAuthResolved(false);
  }, [item.id, item.media_url, item.thumbnail_url, item.video_url, item.image_url, item.comments_count, item.visited_count, item.saved_count, item.collection_save_count]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let cancelled = false;
    let loadSettled = false;
    const hadPreviewMedia = itemHasPreviewMedia(item);
    const mountAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    perfLog("spot slide active", { postId: item.id, slideIndex });

    const finalTimeoutId = window.setTimeout(() => {
      if (cancelled || loadSettled || hadPreviewMedia || itemHasPreviewMedia(item)) {
        return;
      }

      logSpotLoadUiFailure("PostViewerSlide", "detail fetch final timeout — no preview media", {
        receivedSpotId: item.id,
        timeoutMs: SPOT_DETAIL_FETCH_TIMEOUT_MS,
        hadPreviewMedia,
        previewMediaUrl: getViewerSpotMediaUrl(item),
        genericMessage: SPOT_LOAD_ERROR,
      });
      setDetailLoadPhase("error");
      setDetailError(SPOT_LOAD_ERROR);
    }, SPOT_DETAIL_FETCH_TIMEOUT_MS);

    const loadDetail = async () => {
      if (isDemoPostId(item.id)) {
        const demo = findDemoPost(item.id);

        if (!cancelled && demo) {
          setPost(demo);
          setIsDemo(true);
          setDetailLoadPhase("loaded");
        }

        loadSettled = true;
        window.clearTimeout(finalTimeoutId);
        return;
      }

      console.log("[Spot load] PostViewerSlide before loadPostDetail", {
        receivedSpotId: item.id,
        isActive,
        shouldPreloadMedia,
        hadPreviewMedia,
      });

      const result = await loadPostDetail(item.id);

      console.log("[Spot load] PostViewerSlide after loadPostDetail", {
        receivedSpotId: item.id,
        postLoaded: Boolean(result.post),
        loadError: result.error,
        isDemo: result.isDemo,
        hadPreviewMedia,
        previewMediaUrl: getViewerSpotMediaUrl(item),
      });

      loadSettled = true;
      window.clearTimeout(finalTimeoutId);

      if (cancelled) {
        return;
      }

      if (result.post) {
        setPost(result.post);
        setIsDemo(result.isDemo);
        setDetailLoadPhase("loaded");
        setDetailError(null);
        setDetailFetchedOk(true);
        perfSince(mountAt, "spot first data received", { postId: item.id });
        if (result.post.content_kind === "spot") {
          const stats = normalizeSpotPublicStats(result.post);
          setSpotStats(stats);
          setCommentCount(stats.comments_count);
        }
        return;
      }

      if (!hadPreviewMedia && !itemHasPreviewMedia(item)) {
        logSpotLoadUiFailure("PostViewerSlide", "showing generic spot error after failed load", {
          receivedSpotId: item.id,
          supabaseError: result.error,
          genericMessage: SPOT_LOAD_ERROR,
          likelyCause: result.error
            ? "Supabase query failed — see [Spot load] query result above"
            : "Post row missing and feed item had no preview media URLs",
        });
        setDetailLoadPhase("error");
        setDetailError(result.error ?? SPOT_LOAD_ERROR);
      } else {
        setDetailLoadPhase("loaded");
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
      window.clearTimeout(finalTimeoutId);
    };
  }, [item.id, isActive]);

  useEffect(() => {
    if (!isActive || !detailFetchedOk || isDemo || detailError) {
      return;
    }

    if (!isSpot || !post.id) {
      return;
    }

    // Fire-and-forget: never block the viewer on unique-view RPC.
    void recordSpotUniqueView({
      spotId: post.id,
      ownerId: post.user_id,
      viewerId: userId,
    });
  }, [
    isActive,
    detailFetchedOk,
    detailError,
    isDemo,
    isSpot,
    post.id,
    post.user_id,
    userId,
  ]);

  useEffect(() => {
    if (!isActive || isDemo || isDemoPostId(item.id)) {
      return;
    }

    let cancelled = false;

    const loadEngagement = async () => {
      setReactionsLoading(true);
      setReactionsError(null);
      setAuthResolved(true);

      const reactionsResult = await loadPostReactions(item.id, userId);

      if (cancelled) {
        return;
      }

      setReactions(reactionsResult.data);
      setReactionsError(reactionsResult.error);
      setReactionsLoading(false);
      perfLog("spot interaction ready", { postId: item.id });
    };

    void loadEngagement();

    return () => {
      cancelled = true;
    };
  }, [isActive, isDemo, item.id, userId]);

  useEffect(() => {
    const handleStatsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SpotStatsUpdatedDetail>).detail;

      if (!detail || !postIdsEqual(detail.postId, item.id)) {
        return;
      }

      setSpotStats((current) => ({
        visited_count: detail.visited_count ?? current.visited_count,
        comments_count: detail.comments_count ?? current.comments_count,
        saved_count: detail.saved_count ?? current.saved_count,
        unique_view_count: detail.unique_view_count ?? current.unique_view_count,
      }));

      if (detail.comments_count != null) {
        setCommentCount(detail.comments_count);
      }
    };

    window.addEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);

    return () => {
      window.removeEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);
    };
  }, [item.id]);

  useEffect(() => {
    if (!isActive || !isSpot || !userId || isDemoPostId(item.id)) {
      setIsSpotSaved(false);
      return;
    }

    let cancelled = false;

    const loadSaveState = async () => {
      setSaveStateLoading(true);

      try {
        const result = await isSpotSavedByUser(userId, item.id);

        if (cancelled) {
          return;
        }

        setIsSpotSaved(result.saved);

        if (result.error) {
          console.error("[PostViewerSlide] isSpotSavedByUser failed:", result.error);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("[PostViewerSlide] isSpotSavedByUser threw:", loadError);
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
  }, [isActive, isSpot, item.id, userId]);

  useEffect(() => {
    const handleSaveChanged = (event: Event) => {
      const detail = (event as CustomEvent<SpotSaveChangedDetail>).detail;

      if (!detail?.postId || !postIdsEqual(detail.postId, item.id)) {
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
  }, [item.id]);

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
    if (!isActive && !shouldPreloadMedia) {
      return;
    }

    let cancelled = false;

    void loadPostMediaCarouselItems(item.id).then((items) => {
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
  }, [isActive, item.id, shouldPreloadMedia]);

  const spotSources = getReelMediaSources(post);
  const mediaUrl = spotSources.mediaUrl;
  const mediaType = spotSources.mediaType;
  const posterUrl = spotSources.posterUrl ?? post.thumbnail_url ?? null;

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

  const mediaRenderKey = `${item.id}-${mediaUrl ?? ""}-${posterUrl ?? ""}`;
  const mediaPreload: ReelMediaPreload = isActive ? "active" : shouldPreloadMedia ? "adjacent" : "none";
  const shouldLoadMedia = mediaPreload !== "none";
  const hasCarousel = carouselSlides.length > 1;
  const hasSpotMedia = Boolean(hasCarousel || (mediaUrl && mediaType) || posterUrl);

  useEffect(() => {
    if (!onCarouselGestureStateChange || !isActive) {
      return;
    }

    onCarouselGestureStateChange(
      hasCarousel
        ? { itemCount: carouselSlides.length, activeIndex: carouselActiveIndex }
        : null
    );
  }, [
    carouselActiveIndex,
    carouselSlides.length,
    hasCarousel,
    isActive,
    onCarouselGestureStateChange,
  ]);
  const showMediaLayer = hasSpotMedia;
  const detailStillLoading = detailLoadPhase === "loading";
  const showDetailLoading = !hasSpotMedia && detailStillLoading;
  const showDetailError = !hasSpotMedia && detailLoadPhase === "error" && detailError;
  const postAuthor = post.profiles;
  const authorUsername = publicProfileUsername(postAuthor?.username);
  const guidePlace = normalizeGuidePlace(post.guide_places);
  const spotTitle = formatPostDetailSpotTitle(post);
  const showSpotLocation = shouldShowSpotLocation({
    content_kind: post.content_kind,
    spot_name: post.spot_name,
    spot_address: post.spot_address,
    spot_city: post.spot_city,
    spot_country: post.spot_country,
    spot_latitude: post.spot_latitude,
    spot_longitude: post.spot_longitude,
  });
  const isLocationCard = isSpotLocationCardPost(post, {
    carouselItemCount: carouselSlides.length,
    mediaAspectRatio,
  });
  const showSpotLocationInViewer = showSpotLocation;
  const viewerCaption = getSpotCaption(post.content);
  const viewerTitle = isLocationCard ? getSpotLocationCardViewerTitle(post, locale) : null;
  const isOwnPost = Boolean(userId && post.user_id === userId && !isDemo);
  const engagementDisabled = isDemo;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    if (!showMediaLayer) {
      onActiveMediaLoadingChange?.(false);
    }
  }, [isActive, showMediaLayer, onActiveMediaLoadingChange]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `/posts/${item.id}`;
    }

    return `${window.location.origin}/posts/${encodeURIComponent(item.id)}`;
  }, [item.id]);

  const handleRequireAuth = () => {
    setAuthHint("Sign in to save or comment.");
  };

  const handleToggleSave = async () => {
    if (!userId) {
      handleRequireAuth();
      return;
    }

    if (!isSpot || savePending || engagementDisabled) {
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

    const result = await toggleSpotSave(userId, post.id);

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

  const handleOpenSpotLocation = () => {
    if (!showSpotLocation) {
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
      authResolved,
      currentVisitedCount: spotStats.visited_count,
      openSpotLocation,
    });
  };

  return (
    <section
      data-spot-viewer-slide
      data-slide-index={slideIndex}
      data-spot-id={item.id}
      className="relative h-full min-h-[100svh] w-full shrink-0 snap-start snap-always bg-slate-950"
      aria-label={`Post by ${authorUsername}`}
    >
      {isOwnPost ? (
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
              if (!userId) {
                return { ok: false, error: "Sign in required." };
              }

              setSendSpotSheetOpen(false);
              return deleteOwnedPublication(String(post.id), post, userId);
            }}
            onDeleted={() => onItemDeleted?.(post.id)}
          />
        </div>
      ) : null}

      {guidePlace && !mediaUrl && !posterUrl ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center overflow-y-auto px-4 pb-36 pt-[max(3.5rem,env(safe-area-inset-top,0px))]">
          <div className="w-full max-w-md">
            <GuidePlaceCard place={guidePlace} postId={post.id} />
          </div>
        </div>
      ) : showMediaLayer && isLocationCard && (mediaUrl || posterUrl) ? (
        <LocationCardViewerFrame>
          <PostReelMedia
            key={mediaRenderKey}
            mediaUrl={mediaUrl ?? posterUrl!}
            mediaType={mediaType ?? "image"}
            posterUrl={posterUrl}
            isActive={isActive}
            shouldLoad={shouldLoadMedia}
            mediaPreload={mediaPreload}
            audioMuted={Boolean(post.audio_muted)}
            alt={viewerCaption ?? viewerTitle ?? spotTitle ?? ""}
            onLoadingChange={isActive ? onActiveMediaLoadingChange : undefined}
            enableImagePinchZoom={enableImagePinchZoom}
          />
        </LocationCardViewerFrame>
      ) : showMediaLayer && hasCarousel ? (
        <div data-spot-viewer-media className="absolute inset-0">
          <SpotMediaCarousel
            slides={carouselSlides}
            isActive={isActive}
            activeIndex={carouselActiveIndex}
            onActiveIndexChange={setCarouselActiveIndex}
            viewerPlayback
            className="h-full w-full"
            enableImagePinchZoom={enableImagePinchZoom}
          />
        </div>
      ) : showMediaLayer && mediaUrl && mediaType ? (
        <div data-spot-viewer-media className="absolute inset-0">
          <PostReelMedia
            key={mediaRenderKey}
            mediaUrl={mediaUrl}
            mediaType={mediaType}
            posterUrl={posterUrl}
            isActive={isActive}
            shouldLoad={shouldLoadMedia}
            mediaPreload={mediaPreload}
            audioMuted={Boolean(post.audio_muted)}
            alt={viewerCaption ?? viewerTitle ?? spotTitle ?? ""}
            onLoadingChange={isActive ? onActiveMediaLoadingChange : undefined}
            enableImagePinchZoom={enableImagePinchZoom}
          />
        </div>
      ) : showMediaLayer && posterUrl ? (
        <div data-spot-viewer-media className="absolute inset-0">
          <PostReelMedia
            key={mediaRenderKey}
            mediaUrl={posterUrl}
            mediaType="image"
            posterUrl={posterUrl}
            isActive={isActive}
            shouldLoad={shouldLoadMedia}
            mediaPreload={mediaPreload}
            alt={viewerCaption ?? viewerTitle ?? spotTitle ?? ""}
            onLoadingChange={isActive ? onActiveMediaLoadingChange : undefined}
            enableImagePinchZoom={enableImagePinchZoom}
          />
        </div>
      ) : showDetailLoading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 px-6 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden />
          {spotTitle ? (
            <p className="text-sm font-semibold text-white">{spotTitle}</p>
          ) : (
            <p className="text-sm font-medium text-white">Spot</p>
          )}
        </div>
      ) : showDetailError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 px-6 text-center">
          <p className="text-sm text-red-300">{detailError}</p>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 px-6 text-center">
          {spotTitle ? (
            <p className="text-sm font-semibold text-white">{spotTitle}</p>
          ) : (
            <p className="text-sm font-medium text-white">Spot</p>
          )}
          <p className="text-xs text-slate-500">Media unavailable</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-28 pr-16">
        <div className="pointer-events-auto relative space-y-2">
          {!isLocationCard && hasCarousel ? (
            <SpotViewerCarouselIndicator
              slides={carouselSlides}
              activeIndex={carouselActiveIndex}
              showSwipeHint={isActive}
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
              onAuthorClick={
                closeBeforeAuthorProfileNavigation
                  ? (event: MouseEvent<HTMLAnchorElement>) => {
                      // Keep the Search Spot mounted but hidden, then open the profile
                      // so swipe-back returns to this same Spot instead of Search.
                      event.preventDefault();
                      onSuspendForAuthorProfileNavigation?.(post.user_id);
                      router.push(`/user?id=${encodeURIComponent(post.user_id)}`);
                    }
                  : undefined
              }
            />
          ) : null}

          {viewerTitle ? (
            <p className="text-sm font-semibold text-white">
              {viewerTitle}
            </p>
          ) : null}

          {viewerCaption ? (
            <PostCaptionTranslate postId={String(post.id)} caption={viewerCaption} />
          ) : null}

          {showSpotLocationInViewer ? (
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
            <p className="text-xs text-slate-500">Guide preview — reactions are read-only.</p>
          ) : !isLocationCard && authHint ? (
            <p className="text-xs text-amber-200/90">{authHint}</p>
          ) : null}

          {!isLocationCard && reactionsError ? <p className="text-xs text-red-300">{reactionsError}</p> : null}
        </div>
      </div>

      <div
        className="pointer-events-auto absolute bottom-36 right-1.5 z-30 sm:bottom-40"
        onClick={(event) => event.stopPropagation()}
      >
        <PostDetailActionRail
          postId={post.id}
          userId={userId}
          reactions={reactions}
          commentCount={commentCount}
          shareUrl={shareUrl}
          disabled={engagementDisabled}
          variant={isSpot ? "spot" : "default"}
          uniqueViewCount={spotStats.unique_view_count}
          mediaType={mediaType}
          visitedCount={spotStats.visited_count}
          onRequireAuth={handleRequireAuth}
          onCommentClick={() => setCommentsOpen(true)}
          onVisitedClick={isSpot && showSpotLocation ? handleOpenSpotLocation : undefined}
          onSendSpotClick={
            isSpot
              ? () => {
                  setSendSpotSheetOpen(true);
                }
              : undefined
          }
        />
      </div>

      {guidePlace && mediaUrl ? (
        <div
          className="absolute left-4 right-16 z-20 max-h-24 overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md"
          style={{ top: "max(4rem, calc(env(safe-area-inset-top, 0px) + 2.5rem))" }}
        >
          <GuidePlaceCard place={guidePlace} postId={post.id} />
        </div>
      ) : null}

      {isActive && !engagementDisabled ? (
        <PostCommentsSection
          postId={post.id}
          userId={userId}
          disabled={engagementDisabled}
          onRequireAuth={handleRequireAuth}
          mode="drawer"
          drawerOpen={commentsOpen}
          onDrawerClose={() => setCommentsOpen(false)}
          uniqueCommentersCount={isSpot}
          initialCommentCount={commentCount}
          skipInitialCountFetch
          onCountChange={(count) => {
            setCommentCount(count);
            if (isSpot) {
              setSpotStats((current) => ({ ...current, comments_count: count }));
              dispatchSpotStatsUpdated({ postId: post.id, comments_count: count });
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

      {isSpot && sendSpotSheetOpen && post.id ? (
        <SendSpotSheet
          postId={post.id}
          userId={userId}
          shareUrl={shareUrl}
          isOpen={sendSpotSheetOpen}
          onClose={() => setSendSpotSheetOpen(false)}
          onRequireAuth={handleRequireAuth}
          isSaved={isSpotSaved}
          onSavedChange={(saved, savedCount) => {
            setIsSpotSaved(saved);

            if (typeof savedCount === "number") {
              setSpotStats((current) => ({ ...current, saved_count: savedCount }));
            }

            setSaveToast(saved ? t("spotShare.addedToSaved") : t("spotShare.removedFromSaved"));
          }}
        />
      ) : null}

      {isOwnPost && userId ? (
        <EditPublicationScreen
          isOpen={editPublicationOpen}
          userId={userId}
          postId={String(post.id)}
          post={post}
          onClose={() => setEditPublicationOpen(false)}
          onSaved={(next) => {
            setPost((current) => ({
              ...current,
              content: next.content ?? current.content,
              spot_name: next.spot_name ?? current.spot_name,
            }));
          }}
        />
      ) : null}
    </section>
  );
}
