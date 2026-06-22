"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, UserRound } from "lucide-react";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import SpotLocationSummary from "@/components/SpotLocationSummary";
import { useSpotLocationModal } from "@/components/SpotLocationModalProvider";
import GuidePlaceCard from "@/components/GuidePlaceCard";
import OwnContentMenu from "@/components/OwnContentMenu";
import PostCommentsSection from "@/components/PostCommentsSection";
import PostDetailActionRail from "@/components/PostDetailActionRail";
import SaveToCollectionSheet from "@/components/SaveToCollectionSheet";
import SendSpotSheet from "@/components/SendSpotSheet";
import PostMediaViewer from "@/components/PostMediaViewer";
import { deleteOwnedSpot } from "@/lib/deleteContent";
import {
  findDemoPost,
  formatPostDetailSpotTitle,
  type PostDetailRow,
} from "@/lib/postDetail";
import { getSafeAuthSession } from "@/lib/authSession";
import { isGuideAccountProfile } from "@/lib/guideAccounts";
import { isDemoPostId, normalizePostId, postIdForQuery } from "@/lib/postIds";
import { loadPostReactions, type PostReactionState } from "@/lib/postReactions";
import { formatPostTime, getPostMedia, inferMediaTypeFromUrl, POST_AUTHOR_PROFILES_FKEY } from "@/lib/posts";
import { isGuidePlaceRelationMissing, normalizeGuidePlace } from "@/lib/guidePlaces";
import { publicProfileUsername } from "@/lib/publicProfile";
import { getErrorMessage, logExactLoadError, userFacingSupabaseListError } from "@/lib/safeLoad";
import { shouldShowSpotLocation, isSpotContent } from "@/lib/spotLocationDisplay";
import { normalizeSpotPublicStats, recordSpotOpen, EMPTY_SPOT_PUBLIC_STATS, type SpotPublicStats } from "@/lib/spotRanking";
import { dispatchSpotStatsUpdated, SPOT_STATS_UPDATED_EVENT, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";
import { loadSpotCollectionSaveState } from "@/lib/collections";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_REACTIONS: PostReactionState = {
  likeCount: 0,
  usefulCount: 0,
  userLiked: false,
  userMarkedUseful: false,
};

const POST_DETAIL_SELECT =
  `id, user_id, content, created_at, updated_at, image_url, video_url, media_url, media_type, content_kind, spot_name, spot_address, spot_city, spot_country, spot_latitude, spot_longitude, visited_count, comments_count, collection_save_count, guide_places(title, location_name, canton, city, description, opening_hours, price_info, official_url, read_more_text, media_url, media_type, source_url), ${POST_AUTHOR_PROFILES_FKEY}(username, avatar_url)`;
const POST_DETAIL_SELECT_LEGACY =
  `id, user_id, content, created_at, updated_at, image_url, video_url, media_url, media_type, ${POST_AUTHOR_PROFILES_FKEY}(username, avatar_url)`;

function isMissingSpotRankingInSelect(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" && (message.includes("visited_count") || message.includes("comments_count") || message.includes("collection_save_count"));
}

function ShimmerBlock({ className }: { className: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-800/70 before:absolute before:inset-0 before:-translate-x-full before:animate-[spotdrop-shimmer_1.35s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent ${className}`}
    />
  );
}

function PostDetailSkeleton() {
  return (
    <div className="relative flex flex-1 flex-col">
      <ShimmerBlock className="absolute inset-0 bg-slate-900" />
      <div className="relative z-10 mt-auto space-y-2 px-4 pb-28 pr-16">
        <ShimmerBlock className="h-4 w-32 rounded-full" />
        <ShimmerBlock className="h-3 w-48 rounded-full" />
        <ShimmerBlock className="h-4 w-full rounded-full" />
      </div>
      <div className="absolute bottom-28 right-3 z-10 flex flex-col gap-4">
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
  const { t } = useI18n();
  const { openSpotLocation } = useSpotLocationModal();

  const [post, setPost] = useState<PostDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const [engagementReady, setEngagementReady] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<PostReactionState>(EMPTY_REACTIONS);
  const [reactionsLoading, setReactionsLoading] = useState(false);
  const [reactionsError, setReactionsError] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const [commentCount, setCommentCount] = useState(0);
  const [spotStats, setSpotStats] = useState<SpotPublicStats>(EMPTY_SPOT_PUBLIC_STATS);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [sendSpotSheetOpen, setSendSpotSheetOpen] = useState(false);
  const [savedCollectionIds, setSavedCollectionIds] = useState<string[]>([]);
  const [saveStateLoading, setSaveStateLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, [postId]);

  useEffect(() => {
    let cancelled = false;

    const loadPostOnly = async () => {
      setLoading(true);
      setError(null);
      setPost(null);
      setEngagementReady(false);
      setSessionReady(false);
      setUserId(null);
      setReactions(EMPTY_REACTIONS);
      setReactionsError(null);
      setCommentCount(0);
      setSpotStats(EMPTY_SPOT_PUBLIC_STATS);
      setCommentsOpen(false);
      setSaveSheetOpen(false);
      setSavedCollectionIds([]);

      if (!postId) {
        setError("Post not found.");
        setLoading(false);
        return;
      }

      try {
        if (isDemoPostId(postId)) {
          const demoPost = findDemoPost(postId);

          if (cancelled) {
            return;
          }

          if (!demoPost) {
            setError("Post not found.");
            setLoading(false);
            return;
          }

          setPost(demoPost);
          setIsDemo(true);
          setLoading(false);
          return;
        }

        const queryId = postIdForQuery(postId);
        let primaryResult = await supabase
          .from("posts")
          .select(POST_DETAIL_SELECT)
          .eq("id", queryId)
          .single();

        if (isMissingSpotRankingInSelect(primaryResult.error)) {
          primaryResult = await supabase
            .from("posts")
            .select(POST_DETAIL_SELECT.replace(", visited_count, comments_count, collection_save_count", ""))
            .eq("id", queryId)
            .single();
        }

        const { data, error: postError } = isGuidePlaceRelationMissing(primaryResult.error)
          ? await supabase.from("posts").select(POST_DETAIL_SELECT_LEGACY).eq("id", queryId).single()
          : primaryResult;

        if (cancelled) {
          return;
        }

        if (postError) {
          logExactLoadError(postError);
          setError(userFacingSupabaseListError(postError) ?? "Unable to load this post.");
          setLoading(false);
          return;
        }

        if (!data) {
          setError("Post not found.");
          setLoading(false);
          return;
        }

        const row = data as unknown as PostDetailRow & { id: string | number; profiles?: PostDetailRow["profiles"] | PostDetailRow["profiles"][] };
        const authorProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

        if (isGuideAccountProfile(authorProfile)) {
          setError("Post not found.");
          setLoading(false);
          return;
        }

        setPost({
          ...row,
          profiles: authorProfile ?? null,
          id: normalizePostId(row.id) ?? postId,
          spot_latitude: row.spot_latitude != null ? Number(row.spot_latitude) : null,
          spot_longitude: row.spot_longitude != null ? Number(row.spot_longitude) : null,
        });
        if (row.content_kind === "spot") {
          const stats = normalizeSpotPublicStats(row);
          setSpotStats(stats);
          setCommentCount(stats.comments_count);
        }
        setIsDemo(false);
        setLoading(false);
        setEngagementReady(true);
      } catch (loadError) {
        logExactLoadError(loadError);

        if (cancelled) {
          return;
        }

        setError(getErrorMessage(loadError, "Unable to load this post."));
        setLoading(false);
      }
    };

    void loadPostOnly();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    if (!engagementReady || isDemo) {
      return;
    }

    let cancelled = false;

    const loadSession = async () => {
      const { session, error } = await getSafeAuthSession();

      if (!cancelled) {
        setUserId(session?.user?.id ?? null);
        setAuthHint(error);
        setSessionReady(true);
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [engagementReady, isDemo]);

  useEffect(() => {
    if (!engagementReady || isDemo || !sessionReady || !postId) {
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
  }, [engagementReady, isDemo, postId, sessionReady, userId]);

  const isSpotPost = post
    ? isSpotContent({
        content_kind: post.content_kind,
        spot_latitude: post.spot_latitude,
        spot_longitude: post.spot_longitude,
      })
    : false;

  useEffect(() => {
    if (!engagementReady || isDemo || !isSpotPost || !postId) {
      return;
    }

    void recordSpotOpen(postId, Boolean(userId));
  }, [engagementReady, isDemo, isSpotPost, postId, userId]);

  useEffect(() => {
    if (!engagementReady || isDemo || !isSpotPost || !postId || !userId) {
      setSavedCollectionIds([]);
      return;
    }

    let cancelled = false;

    const loadSaveState = async () => {
      setSaveStateLoading(true);

      try {
        const result = await loadSpotCollectionSaveState(userId, postId);

        if (cancelled) {
          return;
        }

        setSavedCollectionIds(result.savedCollectionIds);

        if (result.error) {
          console.error("[PostDetailPage] loadSpotCollectionSaveState failed:", result.error);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("[PostDetailPage] loadSpotCollectionSaveState threw:", loadError);
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

  const handleOpenSaveSheet = () => {
    console.log("OPEN COLLECTION SHEET", {
      source: "PostDetailPage",
      postId,
      userId: userId ?? "guest",
    });
    setSaveSheetOpen(true);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/feed");
  };

  const { mediaUrl, mediaType } = post ? getDetailMedia(post) : { mediaUrl: null, mediaType: null };
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
  const engagementDisabled = isDemo || !engagementReady;
  const showActionRail = Boolean(post && !loading && !error);
  const isOwnPost = Boolean(post && userId && post.user_id === userId && !isDemo);
  const isSpotSaved = savedCollectionIds.length > 0;

  const handleOpenSpotLocation = () => {
    if (!post || !showSpotLocation) {
      return;
    }

    openSpotLocation({
      id: post.id,
      content_kind: post.content_kind,
      spot_name: post.spot_name,
      spot_address: post.spot_address,
      spot_city: post.spot_city,
      spot_country: post.spot_country,
      spot_latitude: post.spot_latitude,
      spot_longitude: post.spot_longitude,
    });
  };

  const resolvedShareUrl = useMemo(() => {
    if (shareUrl) {
      return shareUrl;
    }

    return `/posts/${postId}`;
  }, [postId, shareUrl]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-full bg-black/45 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/60"
          aria-label={t("post.goBack")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("post.back")}
        </button>
        <div className="flex items-center gap-2">
          {isOwnPost && isSpotPost ? (
            <OwnContentMenu
              triggerClassName="bg-black/45 ring-1 ring-white/15 backdrop-blur-md"
              deleteMenuLabel={t("content.deleteSpot")}
              confirmTitle={t("content.deleteSpotTitle")}
              confirmBody={t("content.deleteSpotBody")}
              deletedToast={t("content.spotDeleted")}
              onDelete={async () => {
                console.log("DELETE SPOT HANDLER CALLED", {
                  postId: post!.id,
                  userId,
                  postUserId: post!.user_id,
                });

                if (!userId) {
                  return { ok: false, error: "Sign in required." };
                }

                setSendSpotSheetOpen(false);
                return deleteOwnedSpot(String(post!.id), userId);
              }}
              onDeleted={() => {
                if (window.history.length > 1) {
                  router.back();
                  return;
                }

                router.push("/profile");
              }}
            />
          ) : null}
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-400/35 backdrop-blur-md transition hover:bg-cyan-500/30"
            aria-label={t("post.goToSpots")}
          >
            <SpotDropSpotsIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t("nav.spots")}
          </Link>
        </div>
      </header>

      {loading ? (
        <PostDetailSkeleton />
      ) : error || !post ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-red-300">{localizeUserMessage(t, error) ?? t("post.notFound")}</p>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          >
            {t("post.goBack")}
          </button>
        </div>
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col">
            {guidePlace && !mediaUrl ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-36 pt-20">
                <div className="w-full max-w-md">
                  <GuidePlaceCard place={guidePlace} postId={post.id} />
                </div>
              </div>
            ) : mediaUrl && mediaType ? (
              <div className="absolute inset-0">
                <PostMediaViewer mediaUrl={mediaUrl} mediaType={mediaType} alt={spotTitle ?? post.content ?? ""} />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 pb-36 pt-20 text-center text-sm text-slate-500">
                {t("post.noMedia")}
              </div>
            )}

            {showActionRail ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-24 pr-16">
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

                  {showSpotLocation && post ? (
                    <SpotLocationSummary
                      className="text-xs"
                      location={{
                        id: post.id,
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
                    <p className="text-xs text-slate-500">{t("post.guidePreviewReadOnly")}</p>
                  ) : authHint ? (
                    <p className="text-xs text-amber-200/90">{localizeUserMessage(t, authHint) ?? authHint}</p>
                  ) : null}

                  {reactionsError ? (
                    <p className="text-xs text-red-300">{localizeUserMessage(t, reactionsError) ?? reactionsError}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showActionRail ? (
              <div
                className="pointer-events-auto absolute bottom-28 right-2 z-30"
                onClick={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onTouchEnd={(event) => event.stopPropagation()}
              >
                {!isDemo && engagementReady && (reactionsLoading || !sessionReady) ? (
                  <div className="h-40 w-12 animate-pulse rounded-full bg-white/10" />
                ) : (
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
                    savePending={saveStateLoading && isSpotPost}
                    onRequireAuth={handleRequireAuth}
                    onCommentClick={() => setCommentsOpen(true)}
                    onSaveClick={handleOpenSaveSheet}
                    onVisitedClick={isSpotPost && showSpotLocation ? handleOpenSpotLocation : undefined}
                    onSendSpotClick={isSpotPost ? () => setSendSpotSheetOpen(true) : undefined}
                  />
                )}
              </div>
            ) : null}

            {guidePlace && mediaUrl ? (
              <div className="absolute left-4 right-16 top-20 z-20 max-h-28 overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md">
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
              onDrawerClose={() => setCommentsOpen(false)}
              uniqueCommentersCount={isSpotPost}
              onCountChange={(count) => {
                setCommentCount(count);
                if (isSpotPost) {
                  setSpotStats((current) => ({ ...current, comments_count: count }));
                  dispatchSpotStatsUpdated({ postId, comments_count: count });
                }
              }}
            />
          ) : null}

          {isSpotPost && !engagementDisabled ? (
            <SaveToCollectionSheet
              postId={postId}
              userId={userId}
              isOpen={saveSheetOpen}
              onClose={() => setSaveSheetOpen(false)}
              onSavedChange={setSavedCollectionIds}
              onRequireAuth={handleRequireAuth}
            />
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
        </>
      )}
    </div>
  );
}
