"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Rss, UserRound } from "lucide-react";
import OfficialAIGuideBadge from "@/components/OfficialAIGuideBadge";
import PostCommentsSection from "@/components/PostCommentsSection";
import PostReactionButtons from "@/components/PostReactionButtons";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import { findDemoPost, type PostDetailRow } from "@/lib/postDetail";
import { isDemoPostId, normalizePostId, postIdForQuery } from "@/lib/postIds";
import { loadPostReactions, type PostReactionState } from "@/lib/postReactions";
import { formatPostTime, getPostMedia } from "@/lib/posts";
import { isGuidePlaceRelationMissing, normalizeGuidePlace } from "@/lib/guidePlaces";
import { publicProfileUsername } from "@/lib/publicProfile";
import { getErrorMessage, logExactLoadError, userFacingSupabaseListError } from "@/lib/safeLoad";
import GuidePlaceCard from "@/components/GuidePlaceCard";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_REACTIONS: PostReactionState = {
  likeCount: 0,
  usefulCount: 0,
  userLiked: false,
  userMarkedUseful: false,
};

const POST_DETAIL_SELECT =
  "id, user_id, content, created_at, updated_at, image_url, video_url, media_url, media_type, guide_places(title, location_name, canton, city, description, opening_hours, price_info, official_url, read_more_text, media_url, media_type, source_url), profiles(username, avatar_url, is_ai_guide, is_official)";
const POST_DETAIL_SELECT_LEGACY =
  "id, user_id, content, created_at, updated_at, image_url, video_url, media_url, media_type, profiles(username, avatar_url, is_ai_guide, is_official)";

function ShimmerBlock({ className }: { className: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-800/70 before:absolute before:inset-0 before:-translate-x-full before:animate-[spotdrop-shimmer_1.35s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent ${className}`}
    />
  );
}

function PostDetailSkeleton() {
  return (
    <div className="flex-1 space-y-5">
      <ShimmerBlock className="aspect-[4/5] w-full rounded-none bg-slate-900 sm:aspect-square" />
      <div className="space-y-6 px-4 pb-8">
        <div className="space-y-3">
          <ShimmerBlock className="h-3 w-20 rounded-full" />
          <ShimmerBlock className="h-4 w-11/12 rounded-full" />
          <ShimmerBlock className="h-4 w-7/12 rounded-full" />
        </div>
        <div className="space-y-4 border-t border-white/10 pt-5">
          <div className="flex gap-2">
            <ShimmerBlock className="h-10 w-24 rounded-full" />
            <ShimmerBlock className="h-10 w-28 rounded-full" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`post-comment-skeleton-${index}`} className="flex gap-3">
                <ShimmerBlock className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <ShimmerBlock className="h-3 w-32 rounded-full" />
                  <ShimmerBlock className="h-4 w-full rounded-full" />
                  <ShimmerBlock className="h-4 w-2/3 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
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

function ReactionSkeleton() {
  return (
    <div className="flex gap-2">
      <ShimmerBlock className="h-10 w-24 rounded-full" />
      <ShimmerBlock className="h-10 w-28 rounded-full" />
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

function getDetailMedia(post: PostDetailRow) {
  if (post.media_url) {
    return {
      mediaUrl: post.media_url,
      mediaType: post.media_type === "video" ? ("video" as const) : ("image" as const),
    };
  }

  return getPostMedia(post);
}

function resolveRoutePostId(params: { postId?: string | string[] }) {
  const raw = params.postId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const decoded = value ? decodeURIComponent(value) : "";
  return normalizePostId(decoded) ?? "";
}

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams<{ postId: string | string[] }>();
  const postId = resolveRoutePostId(params);

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
        const primaryResult = await supabase
          .from("posts")
          .select(POST_DETAIL_SELECT)
          .eq("id", queryId)
          .single();
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
        setPost({ ...row, profiles: authorProfile ?? null, id: normalizePostId(row.id) ?? postId });
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

  const handleRequireAuth = () => {
    setAuthHint("Sign in to like, mark useful, or comment.");
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
  const isOfficialAIGuide = Boolean(postAuthor?.is_ai_guide && postAuthor.is_official);
  const guidePlace = normalizeGuidePlace(post?.guide_places);

  return (
    <Shell showHeader={false}>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-lg flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-200 ring-1 ring-cyan-400/30 transition hover:bg-cyan-500/25"
            aria-label="Go to feed"
          >
            <Rss className="h-4 w-4" aria-hidden />
            Feed
          </Link>
        </header>

        {loading ? (
          <PostDetailSkeleton />
        ) : error || !post ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-sm text-red-300">{error ?? "Post not found."}</p>
            <button
              type="button"
              onClick={handleBack}
              className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
            >
              Go back
            </button>
          </div>
        ) : (
          <div className="flex-1 space-y-5">
            {postAuthor ? (
              <Link
                href={`/user/${post.user_id}`}
                className="mx-4 mt-4 flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 transition hover:bg-slate-900"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-white">
                  {postAuthor.avatar_url ? (
                    <img src={postAuthor.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-5 w-5 text-slate-400" strokeWidth={1.5} aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{authorUsername}</p>
                    {isOfficialAIGuide ? <OfficialAIGuideBadge /> : null}
                  </div>
                  <p className="text-xs text-slate-500">Post author</p>
                </div>
              </Link>
            ) : null}

            {guidePlace ? (
              <div className="px-4">
                <GuidePlaceCard place={guidePlace} postId={post.id} />
              </div>
            ) : mediaUrl ? (
              <div className="w-full bg-black">
                {mediaType === "video" ? (
                  <video src={mediaUrl} controls playsInline className="w-full max-h-[72vh] object-contain" />
                ) : (
                  <img src={mediaUrl} alt="" className="w-full object-cover" />
                )}
              </div>
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-slate-900 px-6 text-center text-sm text-slate-500">
                No media for this post
              </div>
            )}

            <div className="space-y-5 px-4 pb-8">
              <time className="block text-xs text-slate-500" dateTime={post.created_at}>
                {formatPostTime(post.created_at)}
              </time>

              {post.content ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{post.content}</p>
              ) : null}

              {isDemo ? (
                <p className="text-xs text-slate-500">Guide preview — reactions and comments are read-only here.</p>
              ) : engagementReady ? (
                <div className="space-y-5 border-t border-white/10 pt-5">
                  {authHint ? <p className="text-sm text-amber-200/90">{authHint}</p> : null}
                  {reactionsLoading || !sessionReady ? (
                    <ReactionSkeleton />
                  ) : (
                    <PostReactionButtons
                      postId={postId}
                      userId={userId}
                      initial={reactions}
                      onRequireAuth={handleRequireAuth}
                    />
                  )}
                  {reactionsError ? <p className="text-xs text-red-300">{reactionsError}</p> : null}
                  <PostCommentsSection postId={postId} userId={userId} onRequireAuth={handleRequireAuth} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
