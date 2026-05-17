"use client";

import { useState } from "react";
import { Heart, Lightbulb, Loader2 } from "lucide-react";
import type { PostReactionState, PostReactionType } from "@/lib/postReactions";
import { togglePostReaction } from "@/lib/postReactions";

type PostReactionButtonsProps = {
  postId: string;
  userId: string | null;
  initial: PostReactionState;
  disabled?: boolean;
  onRequireAuth?: () => void;
};

export default function PostReactionButtons({
  postId,
  userId,
  initial,
  disabled = false,
  onRequireAuth,
}: PostReactionButtonsProps) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState<PostReactionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (reactionType: PostReactionType) => {
    if (disabled) {
      return;
    }

    if (!userId) {
      onRequireAuth?.();
      return;
    }

    const isActive = reactionType === "like" ? state.userLiked : state.userMarkedUseful;

    setPending(reactionType);
    setError(null);

    const result = await togglePostReaction(postId, userId, reactionType, isActive);

    if (result.error) {
      setError(result.error);
      setPending(null);
      return;
    }

    setState((current) => {
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

    setPending(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || pending !== null}
          onClick={() => void handleToggle("like")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
            state.userLiked
              ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40"
              : "bg-white/5 text-white hover:bg-white/10"
          }`}
        >
          {pending === "like" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Heart className={`h-4 w-4 ${state.userLiked ? "fill-current" : ""}`} aria-hidden />
          )}
          Like
          <span className="text-xs font-medium text-slate-400">{state.likeCount}</span>
        </button>
        <button
          type="button"
          disabled={disabled || pending !== null}
          onClick={() => void handleToggle("useful")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
            state.userMarkedUseful
              ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
              : "bg-white/5 text-white hover:bg-white/10"
          }`}
        >
          {pending === "useful" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Lightbulb className={`h-4 w-4 ${state.userMarkedUseful ? "fill-current" : ""}`} aria-hidden />
          )}
          Useful
          <span className="text-xs font-medium text-slate-400">{state.usefulCount}</span>
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
