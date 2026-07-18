"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Loader2, MessageCircle, MoreVertical } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import ZoomableImage from "@/components/ZoomableImage";
import { getProfilePostMedia, type ProfileContentPost } from "@/lib/profileContent";
import { isProfileGalleryVideo, getProfileGalleryDescription } from "@/lib/profileGallery";
import { loadPostCommentsCount } from "@/lib/postComments";
import { loadPostReactions, togglePostReaction, type PostReactionState } from "@/lib/postReactions";
import { useIntersectionVisible } from "@/lib/useIntersectionVisible";

type ProfileGalleryFeedCardProps = {
  item: ProfileContentPost;
  userId: string;
  ownerUsername?: string | null;
  isOwner?: boolean;
  onOpenItemMenu?: (item: ProfileContentPost) => void;
  onCommentsClick: (postId: string) => void;
  /** Set by the parent whenever the shared comments sheet reports a new count for this exact
   *  post_id — the only channel through which this card's own state is ever touched from outside. */
  commentCountUpdate: { postId: string; count: number } | null;
};

type Engagement = {
  reactions: PostReactionState;
  commentCount: number;
};

const EMPTY_REACTIONS: PostReactionState = {
  likeCount: 0,
  usefulCount: 0,
  userLiked: false,
  userMarkedUseful: false,
};

const LIKE_POP_MS = 150;
/** How far ahead (in scroll distance) a card starts fetching its own engagement — generous
 *  enough that on any normal scroll speed the data has already arrived by the time the card
 *  is actually on screen, without fetching the entire gallery's engagement up front. */
const PREFETCH_ROOT_MARGIN = "800px 0px";
const AUTOPLAY_THRESHOLD = 0.6;

export default function ProfileGalleryFeedCard({
  item,
  userId,
  ownerUsername = null,
  isOwner = false,
  onOpenItemMenu,
  onCommentsClick,
  commentCountUpdate,
}: ProfileGalleryFeedCardProps) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const loadedRef = useRef(false);
  const pendingRef = useRef(false);
  const unmountedRef = useRef(false);
  const likePopTimerRef = useRef<number | null>(null);

  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [likePopping, setLikePopping] = useState(false);

  const isNearViewport = useIntersectionVisible(cardRef, { rootMargin: PREFETCH_ROOT_MARGIN });
  const isMostlyVisible = useIntersectionVisible(cardRef, { threshold: AUTOPLAY_THRESHOLD });

  const { mediaUrl, mediaType } = getProfilePostMedia(item);
  const isVideo = isProfileGalleryVideo(item) || mediaType === "video";
  const caption = getProfileGalleryDescription(item);
  const isEngagementLoaded = engagement != null;
  const reactions = engagement?.reactions ?? EMPTY_REACTIONS;
  const commentCount = engagement?.commentCount ?? 0;

  useEffect(() => {
    return () => {
      unmountedRef.current = true;

      if (likePopTimerRef.current !== null) {
        window.clearTimeout(likePopTimerRef.current);
      }
    };
  }, []);

  // Fetches once this card is within PREFETCH_ROOT_MARGIN of the viewport — "load per visible
  // card, prefetch nearby cards" without eagerly fetching the whole gallery's engagement at once.
  useEffect(() => {
    if (!isNearViewport || loadedRef.current || pendingRef.current) {
      return;
    }

    pendingRef.current = true;

    void (async () => {
      const [reactionsResult, commentsResult] = await Promise.all([
        loadPostReactions(item.id, userId),
        loadPostCommentsCount(item.id),
      ]);

      pendingRef.current = false;

      if (unmountedRef.current) {
        return;
      }

      loadedRef.current = true;
      setEngagement({ reactions: reactionsResult.data, commentCount: commentsResult.count });
    })();
  }, [isNearViewport, item.id, userId]);

  // Videos autoplay only while mostly on screen, and pause the instant they're not.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (isMostlyVisible) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [isMostlyVisible]);

  // The shared comments sheet (mounted once at the feed viewer) reports count changes back down
  // here — applied only when the update is actually for this card's own post_id.
  useEffect(() => {
    if (commentCountUpdate?.postId !== item.id) {
      return;
    }

    setEngagement((current) =>
      current ? { ...current, commentCount: commentCountUpdate.count } : current
    );
  }, [commentCountUpdate, item.id]);

  const triggerLikePop = () => {
    setLikePopping(true);

    if (likePopTimerRef.current !== null) {
      window.clearTimeout(likePopTimerRef.current);
    }

    likePopTimerRef.current = window.setTimeout(() => {
      likePopTimerRef.current = null;
      setLikePopping(false);
    }, LIKE_POP_MS);
  };

  const handleToggleLike = async () => {
    if (likePending) {
      return;
    }

    const isActive = reactions.userLiked;
    const previousReactions = reactions;

    setLikePending(true);
    triggerLikePop();

    setEngagement((current) => ({
      reactions: {
        ...(current?.reactions ?? EMPTY_REACTIONS),
        userLiked: !isActive,
        likeCount: Math.max(0, (current?.reactions ?? EMPTY_REACTIONS).likeCount + (isActive ? -1 : 1)),
      },
      commentCount: current?.commentCount ?? 0,
    }));

    const result = await togglePostReaction(item.id, userId, "like", isActive);

    if (result.error) {
      setEngagement((current) => (current ? { ...current, reactions: previousReactions } : current));
    }

    setLikePending(false);
  };

  return (
    <article
      ref={cardRef}
      data-profile-feed-post-id={item.id}
      className="select-none touch-manipulation border-b border-white/[0.08] bg-black"
    >
      {ownerUsername || (isOwner && onOpenItemMenu) ? (
        <header className="flex items-center justify-between gap-2 px-4 py-3">
          {ownerUsername ? (
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{ownerUsername}</p>
          ) : (
            <span />
          )}

          {isOwner && onOpenItemMenu ? (
            <button
              type="button"
              onClick={() => onOpenItemMenu(item)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
              aria-label={t("profile.galleryItemActions")}
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
        </header>
      ) : null}

      <div className="relative w-full bg-black">
        {mediaUrl && isVideo ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            poster={item.video_cover_url ?? item.thumbnail_url ?? item.image_url ?? undefined}
            controls
            muted
            loop
            playsInline
            className="block max-h-[75vh] w-full object-contain"
          />
        ) : mediaUrl ? (
          <ZoomableImage
            src={mediaUrl}
            alt=""
            imageClassName="block max-h-[75vh] w-full"
            objectFit="contain"
            draggable={false}
          />
        ) : (
          <p className="px-4 py-16 text-center text-sm text-slate-400">
            {t("profile.galleryUnavailable")}
          </p>
        )}
      </div>

      <div className="px-4 pb-3 pt-2">
        {isEngagementLoaded ? (
          <div className="flex items-center gap-8" role="toolbar" aria-label={t("profile.galleryActions")}>
            <button
              type="button"
              disabled={likePending}
              onClick={() => void handleToggleLike()}
              className="inline-flex min-h-11 min-w-11 items-center gap-2.5 text-white transition active:opacity-75 disabled:opacity-60"
              aria-label={`${t("postDetail.like")}, ${reactions.likeCount}`}
              aria-pressed={reactions.userLiked}
            >
              {likePending ? (
                <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
              ) : (
                <Heart
                  className={`h-7 w-7 transition-[transform,fill,color] duration-150 ${
                    likePopping ? "scale-110" : "scale-100"
                  } ${reactions.userLiked ? "fill-rose-400 text-rose-400" : "text-white"}`}
                  strokeWidth={1.6}
                  aria-hidden
                />
              )}
              <span className="min-w-[1ch] text-sm font-semibold tabular-nums text-white/95">
                {reactions.likeCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onCommentsClick(item.id)}
              className="inline-flex min-h-11 min-w-11 items-center gap-2.5 text-white transition active:opacity-75"
              aria-label={`${t("postDetail.comments")}, ${commentCount}`}
            >
              <MessageCircle className="h-7 w-7 text-white" strokeWidth={1.6} aria-hidden />
              <span className="min-w-[1ch] text-sm font-semibold tabular-nums text-white/95">
                {commentCount}
              </span>
            </button>
          </div>
        ) : (
          // Renders the moment the card mounts, together with the photo — never a gap where the
          // photo is visible with no engagement row at all, and never a bare "0 / 0".
          <div className="flex items-center gap-8" role="toolbar" aria-label={t("profile.galleryActions")} aria-busy="true">
            <span className="inline-flex min-h-11 min-w-11 items-center gap-2.5">
              <span className="h-7 w-7 animate-pulse rounded-full bg-white/10" aria-hidden />
              <span className="h-4 w-5 animate-pulse rounded-full bg-white/10" aria-hidden />
            </span>
            <span className="inline-flex min-h-11 min-w-11 items-center gap-2.5">
              <span className="h-7 w-7 animate-pulse rounded-full bg-white/10" aria-hidden />
              <span className="h-4 w-5 animate-pulse rounded-full bg-white/10" aria-hidden />
            </span>
          </div>
        )}

        {caption ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
            {ownerUsername ? <span className="mr-1.5 font-semibold text-white">{ownerUsername}</span> : null}
            {caption}
          </p>
        ) : null}
      </div>
    </article>
  );
}
