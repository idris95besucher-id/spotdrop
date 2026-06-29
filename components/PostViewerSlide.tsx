"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import OwnContentMenu from "@/components/OwnContentMenu";
import { useSpotLocationModal } from "@/components/SpotLocationModalProvider";
import PostCommentsSection from "@/components/PostCommentsSection";
import PostDetailActionRail from "@/components/PostDetailActionRail";
import SaveToCollectionSheet from "@/components/SaveToCollectionSheet";
import SendSpotSheet from "@/components/SendSpotSheet";
import PostReelMedia from "@/components/PostReelMedia";
import GuidePlaceCard from "@/components/GuidePlaceCard";
import SpotLocationSummary from "@/components/SpotLocationSummary";
import { deleteOwnedSpot } from "@/lib/deleteContent";
import { getSafeAuthSession } from "@/lib/authSession";
import { isDemoPostId, postIdsEqual } from "@/lib/postIds";
import {
  findDemoPost,
  formatPostDetailSpotTitle,
  loadPostDetail,
  type PostDetailRow,
} from "@/lib/postDetail";
import { loadPostReactions, type PostReactionState } from "@/lib/postReactions";
import { formatPostTime } from "@/lib/posts";
import { getReelMediaSources } from "@/lib/postViewerMedia";
import { publicProfileUsername } from "@/lib/publicProfile";
import { normalizeGuidePlace } from "@/lib/guidePlaces";
import { isSpotContent, shouldShowSpotLocation } from "@/lib/spotLocationDisplay";
import { normalizeSpotPublicStats, type SpotPublicStats } from "@/lib/spotRanking";
import { SPOT_STATS_UPDATED_EVENT, dispatchSpotStatsUpdated, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";
import { seeSpotLocation } from "@/lib/seeSpotLocation";
import { loadSpotCollectionSaveState } from "@/lib/collections";
import { getViewerSpotMediaUrl, type ViewerPostListItem } from "@/lib/postViewer";
import { useI18n } from "@/components/I18nProvider";
import { logSpotLoadUiFailure } from "@/lib/spotLoadDiagnostics";
import {
  SPOT_DETAIL_FETCH_TIMEOUT_MS,
  SPOT_LOAD_ERROR,
  type SpotLoadPhase,
} from "@/lib/spotLoadState";

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
}: PostViewerSlideProps) {
  const { t } = useI18n();
  const [post, setPost] = useState<PostDetailRow>(() => previewToPost(item));
  const [detailLoadPhase, setDetailLoadPhase] = useState<SpotLoadPhase>("loading");
  const [detailError, setDetailError] = useState<string | null>(null);
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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [sendSpotSheetOpen, setSendSpotSheetOpen] = useState(false);
  const [savedCollectionIds, setSavedCollectionIds] = useState<string[]>([]);
  const [saveStateLoading, setSaveStateLoading] = useState(false);
  const isSpot = isSpotContent({
    content_kind: post.content_kind,
    spot_latitude: post.spot_latitude,
    spot_longitude: post.spot_longitude,
  });
  const isSpotSaved = savedCollectionIds.length > 0;
  const { openSpotLocation } = useSpotLocationModal();

  useEffect(() => {
    setPost(previewToPost(item));
    setDetailLoadPhase("loading");
    setDetailError(null);
    setIsDemo(isDemoPostId(item.id));
    setReactions(EMPTY_REACTIONS);
    setCommentsOpen(false);
    setSaveSheetOpen(false);
    setSendSpotSheetOpen(false);
    setSavedCollectionIds([]);
    setCommentCount(item.comments_count ?? 0);
    setSpotStats(normalizeSpotPublicStats(item));
    setAuthResolved(false);
  }, [item.id, item.media_url, item.thumbnail_url, item.video_url, item.image_url, item.comments_count, item.visited_count, item.saved_count, item.collection_save_count]);

  useEffect(() => {
    if (!isActive && !shouldPreloadMedia) {
      return;
    }

    let cancelled = false;
    let loadSettled = false;
    const hadPreviewMedia = itemHasPreviewMedia(item);

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
  }, [item.id, isActive, shouldPreloadMedia]);

  useEffect(() => {
    if (!isActive || isDemo || isDemoPostId(item.id)) {
      return;
    }

    let cancelled = false;

    const loadEngagement = async () => {
      setReactionsLoading(true);
      setReactionsError(null);

      const sessionResult = await getSafeAuthSession();

      if (cancelled) {
        return;
      }

      if (sessionResult.error) {
        setAuthHint(sessionResult.error);
      }

      setAuthResolved(true);

      const reactionsResult = await loadPostReactions(item.id, sessionResult.session?.user?.id ?? null);

      if (cancelled) {
        return;
      }

      setReactions(reactionsResult.data);
      setReactionsError(reactionsResult.error);
      setReactionsLoading(false);
    };

    void loadEngagement();

    return () => {
      cancelled = true;
    };
  }, [isActive, isDemo, item.id]);

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
      setSavedCollectionIds([]);
      return;
    }

    let cancelled = false;

    const loadSaveState = async () => {
      setSaveStateLoading(true);

      try {
        const result = await loadSpotCollectionSaveState(userId, item.id);

        if (cancelled) {
          return;
        }

        setSavedCollectionIds(result.savedCollectionIds);

        if (result.error) {
          console.error("[PostViewerSlide] loadSpotCollectionSaveState failed:", result.error);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("[PostViewerSlide] loadSpotCollectionSaveState threw:", loadError);
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

  const spotSources = getReelMediaSources(post);
  const mediaUrl = spotSources.mediaUrl;
  const mediaType = spotSources.mediaType;
  const posterUrl = spotSources.posterUrl ?? post.thumbnail_url ?? null;
  const mediaRenderKey = `${item.id}-${mediaUrl ?? ""}-${posterUrl ?? ""}`;
  const shouldLoadMedia = isActive || shouldPreloadMedia;
  const hasSpotMedia = Boolean((mediaUrl && mediaType) || posterUrl);
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
  const isOwnPost = Boolean(userId && post.user_id === userId && !isDemo);
  const isOwnSpot = isSpot && isOwnPost;
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

  const handleOpenSaveSheet = () => {
    console.log("OPEN COLLECTION SHEET", {
      source: "PostViewerSlide",
      postId: post.id,
      isActive,
      userId: userId ?? "guest",
    });
    setSaveSheetOpen(true);
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
      data-slide-index={slideIndex}
      data-spot-id={item.id}
      className="relative h-[100dvh] w-full shrink-0 snap-start snap-always bg-slate-950"
      aria-label={`Post by ${authorUsername}`}
    >
      {guidePlace && !mediaUrl && !posterUrl ? (
        <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4 pb-36 pt-16">
          <div className="w-full max-w-md">
            <GuidePlaceCard place={guidePlace} postId={post.id} />
          </div>
        </div>
      ) : showMediaLayer && mediaUrl && mediaType ? (
        <PostReelMedia
          key={mediaRenderKey}
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          posterUrl={posterUrl}
          isActive={isActive}
          shouldLoad={shouldLoadMedia}
          alt={spotTitle ?? post.content ?? ""}
          onLoadingChange={isActive ? onActiveMediaLoadingChange : undefined}
        />
      ) : showMediaLayer && posterUrl ? (
        <PostReelMedia
          key={mediaRenderKey}
          mediaUrl={posterUrl}
          mediaType="image"
          posterUrl={posterUrl}
          isActive={isActive}
          shouldLoad={shouldLoadMedia}
          alt={spotTitle ?? post.content ?? ""}
          onLoadingChange={isActive ? onActiveMediaLoadingChange : undefined}
        />
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

      {isOwnSpot ? (
        <div className="absolute right-3 top-[max(3.25rem,env(safe-area-inset-top))] z-30">
          <OwnContentMenu
            triggerClassName="bg-black/45 ring-1 ring-white/15 backdrop-blur-md"
            deleteMenuLabel={t("content.deleteSpot")}
            confirmTitle={t("content.deleteSpotTitle")}
            confirmBody={t("content.deleteSpotBody")}
            deletedToast={t("content.spotDeleted")}
            onDelete={async () => {
              if (!userId) {
                return { ok: false, error: "Sign in required." };
              }

              setSendSpotSheetOpen(false);
              return deleteOwnedSpot(String(post.id), userId);
            }}
            onDeleted={() => onItemDeleted?.(post.id)}
          />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-28 pr-16">
        <div className="pointer-events-auto space-y-2">
          {postAuthor ? (
            <Link href={`/user?id=${post.user_id}`} className="inline-flex max-w-full items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-900">
                {postAuthor.avatar_url ? (
                  <img src={postAuthor.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <span className="truncate text-sm font-semibold text-white">{authorUsername}</span>
            </Link>
          ) : null}

          {spotTitle ? <p className="text-sm font-semibold text-white">{spotTitle}</p> : null}

          {showSpotLocation ? (
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

          {post.content ? (
            <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{post.content}</p>
          ) : null}

          <time className="block text-[11px] text-slate-400" dateTime={post.created_at}>
            {formatPostTime(post.created_at)}
          </time>

          {isDemo ? (
            <p className="text-xs text-slate-500">Guide preview — reactions are read-only.</p>
          ) : authHint ? (
            <p className="text-xs text-amber-200/90">{authHint}</p>
          ) : null}

          {reactionsError ? <p className="text-xs text-red-300">{reactionsError}</p> : null}
        </div>
      </div>

      <div
        className="pointer-events-auto absolute bottom-28 right-2 z-30"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
      >
        {reactionsLoading ? (
          <div className="h-40 w-12 animate-pulse rounded-full bg-white/10" />
        ) : (
          <PostDetailActionRail
            postId={post.id}
            userId={userId}
            reactions={reactions}
            commentCount={commentCount}
            shareUrl={shareUrl}
            disabled={engagementDisabled}
            variant={isSpot ? "spot" : "default"}
            isSpotSaved={isSpotSaved}
            savedCount={spotStats.saved_count}
            visitedCount={spotStats.visited_count}
            savePending={saveStateLoading && isSpot}
            onRequireAuth={handleRequireAuth}
            onCommentClick={() => setCommentsOpen(true)}
            onSaveClick={handleOpenSaveSheet}
            onVisitedClick={isSpot && showSpotLocation ? handleOpenSpotLocation : undefined}
            onSendSpotClick={
              isSpot
                ? () => {
                    setSendSpotSheetOpen(true);
                  }
                : undefined
            }
          />
        )}
      </div>

      {guidePlace && mediaUrl ? (
        <div className="absolute left-4 right-16 top-16 z-20 max-h-24 overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md">
          <GuidePlaceCard place={guidePlace} postId={post.id} />
        </div>
      ) : null}

      {!engagementDisabled ? (
        <PostCommentsSection
          postId={post.id}
          userId={userId}
          disabled={engagementDisabled}
          onRequireAuth={handleRequireAuth}
          mode="drawer"
          drawerOpen={commentsOpen && isActive}
          onDrawerClose={() => setCommentsOpen(false)}
          uniqueCommentersCount={isSpot}
          onCountChange={(count) => {
            setCommentCount(count);
            if (isSpot) {
              setSpotStats((current) => ({ ...current, comments_count: count }));
              dispatchSpotStatsUpdated({ postId: post.id, comments_count: count });
            }
          }}
        />
      ) : null}

      {isSpot && !engagementDisabled ? (
        <SaveToCollectionSheet
          postId={post.id}
          userId={userId}
          isOpen={saveSheetOpen}
          onClose={() => setSaveSheetOpen(false)}
          onSavedChange={setSavedCollectionIds}
          onRequireAuth={handleRequireAuth}
        />
      ) : null}

      {isSpot && sendSpotSheetOpen && post.id ? (
        <SendSpotSheet
          postId={post.id}
          userId={userId}
          shareUrl={shareUrl}
          isOpen={sendSpotSheetOpen}
          onClose={() => setSendSpotSheetOpen(false)}
          onRequireAuth={handleRequireAuth}
        />
      ) : null}
    </section>
  );
}
