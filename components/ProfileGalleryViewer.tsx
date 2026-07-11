"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, MoreVertical, ThumbsUp, X } from "lucide-react";
import SpotCommentsSheet from "@/components/SpotCommentsSheet";
import { useI18n } from "@/components/I18nProvider";
import { getProfilePostMedia, type ProfileContentPost } from "@/lib/profileContent";
import { isProfileGalleryVideo, getProfileGalleryDescription } from "@/lib/profileGallery";
import { loadPostCommentsCount } from "@/lib/postComments";
import {
  loadPostReactions,
  togglePostReaction,
  type PostReactionState,
} from "@/lib/postReactions";

type ProfileGalleryViewerProps = {
  items: ProfileContentPost[];
  activeIndex: number;
  userId: string;
  isOwner?: boolean;
  onClose: () => void;
  onActiveIndexChange: (index: number) => void;
  onOpenItemMenu?: () => void;
};

type ItemEngagement = {
  reactions: PostReactionState;
  commentCount: number;
  loaded: boolean;
};

const EMPTY_REACTIONS: PostReactionState = {
  likeCount: 0,
  usefulCount: 0,
  userLiked: false,
  userMarkedUseful: false,
};

const LIKE_POP_MS = 150;
const CHROME_FADE_MS = 420;

export default function ProfileGalleryViewer({
  items,
  activeIndex,
  userId,
  isOwner = false,
  onClose,
  onActiveIndexChange,
  onOpenItemMenu,
}: ProfileGalleryViewerProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const loadedEngagementPostIdsRef = useRef(new Set<string>());
  const likePopTimerRef = useRef<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likePopping, setLikePopping] = useState(false);
  const [engagementByPostId, setEngagementByPostId] = useState<Record<string, ItemEngagement>>({});

  const item = items[activeIndex] ?? null;
  const itemDescription = item ? getProfileGalleryDescription(item) : "";
  const engagement = item ? engagementByPostId[item.id] : null;
  const reactions = engagement?.reactions ?? EMPTY_REACTIONS;
  const commentCount = engagement?.commentCount ?? 0;

  useEffect(() => {
    setMounted(true);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setChromeVisible(true));
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;

      if (likePopTimerRef.current !== null) {
        window.clearTimeout(likePopTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCommentsOpen(false);
  }, [activeIndex]);

  useEffect(() => {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    container.querySelectorAll("video").forEach((video, index) => {
      if (index === activeIndex) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [activeIndex]);

  useEffect(() => {
    if (!item?.id) {
      return;
    }

    const postId = item.id;

    if (loadedEngagementPostIdsRef.current.has(postId)) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const [reactionsResult, commentsResult] = await Promise.all([
        loadPostReactions(postId, userId),
        loadPostCommentsCount(postId),
      ]);

      if (cancelled) {
        return;
      }

      loadedEngagementPostIdsRef.current.add(postId);

      setEngagementByPostId((current) => ({
        ...current,
        [postId]: {
          reactions: reactionsResult.data,
          commentCount: commentsResult.count,
          loaded: true,
        },
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [item?.id, userId]);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const container = scrollRef.current;

      if (!container) {
        return;
      }

      const width = container.clientWidth;

      if (width <= 0) {
        return;
      }

      programmaticScrollRef.current = true;
      container.scrollTo({ left: width * index, behavior });

      window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, behavior === "smooth" ? 320 : 0);
    },
    []
  );

  useEffect(() => {
    scrollToIndex(activeIndex, "smooth");
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    const container = scrollRef.current;

    if (!container || items.length <= 1) {
      return;
    }

    const readIndex = () => {
      const width = container.clientWidth;

      if (width <= 0) {
        return 0;
      }

      return Math.min(items.length - 1, Math.max(0, Math.round(container.scrollLeft / width)));
    };

    const handleScroll = () => {
      if (programmaticScrollRef.current) {
        return;
      }

      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
      }

      scrollSettleTimerRef.current = window.setTimeout(() => {
        scrollSettleTimerRef.current = null;
        const index = readIndex();

        if (index !== activeIndex) {
          onActiveIndexChange(index);
        }
      }, 80);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);

      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
        scrollSettleTimerRef.current = null;
      }
    };
  }, [activeIndex, items.length, onActiveIndexChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (commentsOpen) {
        return;
      }

      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && activeIndex > 0) {
        onActiveIndexChange(activeIndex - 1);
      }

      if (event.key === "ArrowRight" && activeIndex < items.length - 1) {
        onActiveIndexChange(activeIndex + 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, commentsOpen, items.length, onActiveIndexChange, onClose]);

  const updateEngagement = useCallback((postId: string, patch: Partial<ItemEngagement>) => {
    setEngagementByPostId((current) => {
      const existing = current[postId] ?? {
        reactions: EMPTY_REACTIONS,
        commentCount: 0,
        loaded: true,
      };

      return {
        ...current,
        [postId]: {
          ...existing,
          ...patch,
          reactions: patch.reactions ?? existing.reactions,
        },
      };
    });
  }, []);

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
    if (!item || likePending) {
      return;
    }

    const postId = item.id;
    const isActive = reactions.userLiked;
    const previousReactions = reactions;

    setLikePending(true);
    triggerLikePop();

    updateEngagement(postId, {
      reactions: {
        ...reactions,
        userLiked: !isActive,
        likeCount: Math.max(0, reactions.likeCount + (isActive ? -1 : 1)),
      },
    });

    const result = await togglePostReaction(postId, userId, "like", isActive);

    if (result.error) {
      updateEngagement(postId, { reactions: previousReactions });
    }

    setLikePending(false);
  };

  const handleCommentCountChange = useCallback(
    (count: number) => {
      if (!item) {
        return;
      }

      updateEngagement(item.id, { commentCount: count });
    },
    [item, updateEngagement]
  );

  if (!mounted || !item || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] flex flex-col bg-black" role="dialog" aria-modal="true">
        <div
          className={`flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-500 ${
            chromeVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDuration: `${CHROME_FADE_MS}ms` }}
        >
          <p className="text-sm font-medium text-white/80">
            {activeIndex + 1} / {items.length}
          </p>
          <div className="flex items-center gap-1">
            {isOwner && onOpenItemMenu ? (
              <button
                type="button"
                onClick={onOpenItemMenu}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
                aria-label={t("profile.galleryItemActions")}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))]">
          <div
            ref={scrollRef}
            className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((galleryItem, index) => {
              const { mediaUrl, mediaType } = getProfilePostMedia(galleryItem);
              const isVideo = isProfileGalleryVideo(galleryItem) || mediaType === "video";
              const isActiveSlide = index === activeIndex;

              return (
                <div
                  key={galleryItem.id}
                  className="relative flex h-full w-full shrink-0 snap-center snap-always items-center justify-center px-1"
                >
                  {mediaUrl && isVideo ? (
                    <video
                      src={mediaUrl}
                      poster={
                        galleryItem.video_cover_url ??
                        galleryItem.thumbnail_url ??
                        galleryItem.image_url ??
                        undefined
                      }
                      controls
                      playsInline
                      autoPlay={isActiveSlide}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : mediaUrl ? (
                    <img
                      src={mediaUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">{t("profile.galleryUnavailable")}</p>
                  )}
                </div>
              );
            })}
          </div>

          {activeIndex > 0 ? (
            <button
              type="button"
              onClick={() => onActiveIndexChange(activeIndex - 1)}
              className={`absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/10 transition-opacity sm:inline-flex sm:h-10 sm:w-10 ${
                chromeVisible ? "opacity-100" : "opacity-0"
              }`}
              aria-label={t("profile.galleryPrevious")}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null}

          {activeIndex < items.length - 1 ? (
            <button
              type="button"
              onClick={() => onActiveIndexChange(activeIndex + 1)}
              className={`absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/10 transition-opacity sm:inline-flex sm:h-10 sm:w-10 ${
                chromeVisible ? "opacity-100" : "opacity-0"
              }`}
              aria-label={t("profile.galleryNext")}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          ) : null}

          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] transition-all duration-500 ${
              chromeVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
            style={{ transitionDuration: `${CHROME_FADE_MS}ms` }}
          >
            {itemDescription ? (
              <p className="pointer-events-none max-w-md whitespace-pre-wrap px-2 text-center text-[15px] leading-relaxed text-white/95 drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
                {itemDescription}
              </p>
            ) : null}

            <div
              className="pointer-events-auto inline-flex items-center gap-8 rounded-[18px] border border-white/14 bg-black/42 px-5 py-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150"
              role="toolbar"
              aria-label={t("profile.galleryActions")}
            >
              <button
                type="button"
                disabled={likePending}
                onClick={() => void handleToggleLike()}
                className="inline-flex items-center gap-2.5 rounded-full px-1 py-0.5 text-white transition active:opacity-80 disabled:opacity-60"
                aria-label={`${t("postDetail.like")}, ${reactions.likeCount}`}
                aria-pressed={reactions.userLiked}
              >
                {likePending ? (
                  <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
                ) : (
                  <ThumbsUp
                    className={`h-8 w-8 transition-[transform,fill,color] duration-150 ${
                      likePopping ? "scale-[1.15]" : "scale-100"
                    } ${reactions.userLiked ? "fill-cyan-400 text-cyan-400" : "text-white"}`}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
                <span className="min-w-[1ch] text-[15px] font-semibold tabular-nums leading-none">
                  {reactions.likeCount}
                </span>
              </button>

              <span className="h-5 w-px bg-white/12" aria-hidden />

              <button
                type="button"
                onClick={() => setCommentsOpen(true)}
                className="inline-flex items-center gap-2.5 rounded-full px-1 py-0.5 text-white transition active:opacity-80"
                aria-label={`${t("postDetail.comments")}, ${commentCount}`}
              >
                <MessageCircle className="h-8 w-8 text-white" strokeWidth={1.75} aria-hidden />
                <span className="min-w-[1ch] text-[15px] font-semibold tabular-nums leading-none">
                  {commentCount}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <SpotCommentsSheet
        postId={item.id}
        userId={userId}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={handleCommentCountChange}
        elevated
        initialCommentCount={commentCount}
        skipInitialCountFetch
      />
    </>,
    document.body
  );
}
