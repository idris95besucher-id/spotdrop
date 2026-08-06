"use client";

import { useEffect, useState } from "react";
import { BarChart3, Bookmark, Footprints, Heart, Loader2, MessageCircle, Play, Send, Share2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { PostReactionState, PostReactionType } from "@/lib/postReactions";
import { togglePostReaction } from "@/lib/postReactions";

type PostDetailActionRailProps = {
  postId: string;
  userId: string | null;
  reactions: PostReactionState;
  commentCount: number;
  shareUrl: string;
  disabled?: boolean;
  variant?: "default" | "spot";
  /** Unique full-Spot opens — spot rail views badge only. */
  uniqueViewCount?: number;
  /** Drives the views badge icon: video → Play, photo/unknown → BarChart3. */
  mediaType?: "image" | "video" | null;
  isSpotSaved?: boolean;
  savedCount?: number;
  visitedCount?: number;
  sendCount?: number;
  savePending?: boolean;
  onRequireAuth?: () => void;
  onCommentClick: () => void;
  onVisitedClick?: () => void;
  onSaveClick?: () => void;
  onSendSpotClick?: () => void;
};

export default function PostDetailActionRail({
  postId,
  userId,
  reactions: initialReactions,
  commentCount,
  shareUrl,
  disabled = false,
  variant = "default",
  uniqueViewCount = 0,
  mediaType = null,
  visitedCount = 0,
  sendCount,
  onRequireAuth,
  onCommentClick,
  onVisitedClick,
  onSendSpotClick,
}: PostDetailActionRailProps) {
  const { t } = useI18n();
  const [reactions, setReactions] = useState(initialReactions);
  const [pending, setPending] = useState<PostReactionType | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const isSpot = variant === "spot";
  const actionStackGapClass = isSpot ? "gap-3.5" : "gap-4";
  const views = Math.max(0, Number(uniqueViewCount) || 0);
  const visits = Math.max(0, Number(visitedCount) || 0);
  const comments = Math.max(0, Number(commentCount) || 0);

  useEffect(() => {
    setReactions(initialReactions);
  }, [initialReactions]);

  const handleToggle = async (reactionType: PostReactionType) => {
    if (disabled) {
      return;
    }

    if (!userId) {
      onRequireAuth?.();
      return;
    }

    const isActive = reactionType === "like" ? reactions.userLiked : reactions.userMarkedUseful;

    setPending(reactionType);

    const result = await togglePostReaction(postId, userId, reactionType, isActive);

    if (!result.error) {
      setReactions((current) => {
        if (reactionType === "like") {
          return {
            ...current,
            userLiked: !isActive,
            likeCount: Math.max(0, current.likeCount + (isActive ? -1 : 1)),
          };
        }

        return {
          ...current,
          userMarkedUseful: !isActive,
          usefulCount: Math.max(0, current.usefulCount + (isActive ? -1 : 1)),
        };
      });
    }

    setPending(null);
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url: shareUrl, title: "SpotDrop" });
        return;
      } catch (shareError) {
        if (shareError instanceof Error && shareError.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage(t("postDetail.linkCopied"));
      window.setTimeout(() => setShareMessage(null), 2000);
    } catch {
      setShareMessage(t("postDetail.unableToShare"));
      window.setTimeout(() => setShareMessage(null), 2000);
    }
  };

  const handleVisitedClick = () => {
    if (disabled) {
      return;
    }

    onVisitedClick?.();
  };

  const handleSendSpotClick = () => {
    if (disabled) {
      return;
    }

    console.info(`SEND_SPOT_CLICKED postId=${postId}`);
    onSendSpotClick?.();
  };

  const actionButtonClass = isSpot
    ? "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.65))] transition active:scale-95 disabled:opacity-50"
    : "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1 text-white transition active:scale-95 disabled:opacity-50";

  const actionLabelClass = "text-[11px] font-semibold leading-tight";
  const actionCountClass = isSpot
    ? "text-center text-[11px] font-semibold tabular-nums leading-none text-white"
    : "text-[11px] font-semibold tabular-nums leading-tight text-white/90";

  if (isSpot) {
    return (
      <div className={`flex flex-col items-center ${actionStackGapClass}`}>
        <div
          className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 px-1 py-1 text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.65))]"
          aria-label={t("search.uniqueViewsLabel", { count: views })}
        >
          {mediaType === "video" ? (
            <Play className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          ) : (
            <BarChart3 className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          )}
          <span className={actionCountClass}>{views}</span>
        </div>

        <button
          type="button"
          onClick={onCommentClick}
          disabled={disabled}
          className={actionButtonClass}
          aria-label={`${t("postDetail.comments")}, ${comments}`}
        >
          <MessageCircle className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          <span className={actionCountClass}>{comments}</span>
        </button>

        {onVisitedClick ? (
          <button
            type="button"
            disabled={disabled}
            onClick={handleVisitedClick}
            className={actionButtonClass}
            aria-label={`${t("postDetail.visited")}, ${visits}`}
          >
            <Footprints className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            <span className={actionCountClass}>{visits}</span>
          </button>
        ) : null}

        {onSendSpotClick ? (
          <button
            type="button"
            disabled={disabled}
            onClick={handleSendSpotClick}
            className={actionButtonClass}
            aria-label={sendCount != null ? `${t("postDetail.send")}, ${sendCount}` : t("postDetail.send")}
          >
            <Send className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${actionStackGapClass}`}>
      <button
        type="button"
        disabled={disabled || pending !== null}
        onClick={() => void handleToggle("like")}
        className={actionButtonClass}
        aria-label={t("postDetail.like")}
      >
        {pending === "like" ? (
          <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
        ) : (
          <Heart className={`h-7 w-7 ${reactions.userLiked ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden />
        )}
        <span className="text-[11px] font-semibold tabular-nums">{reactions.likeCount}</span>
      </button>

      <button
        type="button"
        onClick={onCommentClick}
        disabled={disabled}
        className={`${actionButtonClass} min-w-[3rem]`}
        aria-label={`${t("postDetail.comments")}, ${commentCount}`}
      >
        <MessageCircle className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        <span className={actionLabelClass}>{commentCount}</span>
      </button>

      <button
        type="button"
        disabled={disabled || pending !== null}
        onClick={() => void handleToggle("useful")}
        className={actionButtonClass}
        aria-label={t("postDetail.save")}
      >
        {pending === "useful" ? (
          <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
        ) : (
          <Bookmark
            className={`h-7 w-7 ${reactions.userMarkedUseful ? "fill-amber-300 text-amber-300" : ""}`}
            aria-hidden
          />
        )}
        <span className="text-[11px] font-semibold">{t("postDetail.save")}</span>
      </button>

      <button
        type="button"
        onClick={() => void handleShare()}
        className={`${actionButtonClass} min-w-[3rem]`}
        aria-label={t("postDetail.share")}
      >
        <Share2 className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        <span className={actionLabelClass}>{shareMessage ?? t("postDetail.share")}</span>
      </button>
    </div>
  );
}
