"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Heart, Loader2, MessageCircle, MoreVertical, X } from "lucide-react";
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
  ownerUsername?: string | null;
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

type SlideLayout = {
  aspectRatio: number;
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
const MAX_VIEWER_HEIGHT_RATIO = 0.72;

function measureImageAspectRatio(url: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(image.naturalWidth / image.naturalHeight);
      } else {
        resolve(4 / 5);
      }
    };
    image.onerror = () => resolve(4 / 5);
    image.src = url;
  });
}

export default function ProfileGalleryViewer({
  items,
  activeIndex,
  userId,
  ownerUsername = null,
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
  const [slideLayouts, setSlideLayouts] = useState<Record<string, SlideLayout>>({});

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
    let cancelled = false;

    void (async () => {
      const updates: Record<string, SlideLayout> = {};

      await Promise.all(
        items.map(async (galleryItem) => {
          const { mediaUrl } = getProfilePostMedia(galleryItem);
          const isVideo = isProfileGalleryVideo(galleryItem);

          if (!mediaUrl || isVideo) {
            updates[galleryItem.id] = { aspectRatio: 4 / 5, loaded: true };
            return;
          }

          const aspectRatio = await measureImageAspectRatio(mediaUrl);
          updates[galleryItem.id] = { aspectRatio, loaded: true };
        })
      );

      if (!cancelled && Object.keys(updates).length > 0) {
        setSlideLayouts((current) => {
          const next = { ...current };

          for (const [id, layout] of Object.entries(updates)) {
            if (!next[id]?.loaded) {
              next[id] = layout;
            }
          }

          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

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

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((galleryItem, index) => {
              const { mediaUrl, mediaType } = getProfilePostMedia(galleryItem);
              const isVideo = isProfileGalleryVideo(galleryItem) || mediaType === "video";
              const isActiveSlide = index === activeIndex;
              const layout = slideLayouts[galleryItem.id];
              const aspectRatio = layout?.aspectRatio ?? 4 / 5;

              return (
                <div
                  key={galleryItem.id}
                  className="flex h-full w-full shrink-0 snap-center snap-always flex-col"
                >
                  <div className="flex min-h-0 flex-1 items-center justify-center px-3">
                    <div
                      className="relative mx-auto flex items-center justify-center"
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        height: Math.min(
                          Math.round(
                            (typeof window !== "undefined" ? window.innerHeight : 844) *
                              MAX_VIEWER_HEIGHT_RATIO
                          ),
                          Math.round(
                            (typeof window !== "undefined" ? window.innerWidth : 390) / aspectRatio
                          )
                        ),
                        maxHeight: `min(${MAX_VIEWER_HEIGHT_RATIO * 100}vh, calc(100vw / ${aspectRatio}))`,
                      }}
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
                          className="h-full w-full object-contain"
                        />
                      ) : mediaUrl ? (
                        <img
                          src={mediaUrl}
                          alt=""
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <p className="text-sm text-slate-400">{t("profile.galleryUnavailable")}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeIndex > 0 ? (
            <button
              type="button"
              onClick={() => onActiveIndexChange(activeIndex - 1)}
              className={`absolute left-2 top-[38%] z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/10 transition-opacity sm:inline-flex sm:h-10 sm:w-10 ${
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
              className={`absolute right-2 top-[38%] z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/10 transition-opacity sm:inline-flex sm:h-10 sm:w-10 ${
                chromeVisible ? "opacity-100" : "opacity-0"
              }`}
              aria-label={t("profile.galleryNext")}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          ) : null}

          <div
            className={`shrink-0 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3 transition-all duration-500 ${
              chromeVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
            style={{ transitionDuration: `${CHROME_FADE_MS}ms` }}
          >
            {ownerUsername ? (
              <p className="mb-1 text-sm font-semibold text-white">{ownerUsername}</p>
            ) : null}

            {itemDescription ? (
              <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                {itemDescription}
              </p>
            ) : (
              <div className="mb-3 h-0" aria-hidden />
            )}

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
                onClick={() => setCommentsOpen(true)}
                className="inline-flex min-h-11 min-w-11 items-center gap-2.5 text-white transition active:opacity-75"
                aria-label={`${t("postDetail.comments")}, ${commentCount}`}
              >
                <MessageCircle className="h-7 w-7 text-white" strokeWidth={1.6} aria-hidden />
                <span className="min-w-[1ch] text-sm font-semibold tabular-nums text-white/95">
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
