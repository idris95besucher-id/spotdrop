"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import { Loader2, MessageCircle, Send, UserRound } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { addPostComment, loadPostComments, loadPostCommentsCount, type PostCommentRow } from "@/lib/postComments";
import { loadSpotPublicStats } from "@/lib/spotRanking";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { formatPostTime } from "@/lib/posts";
import { isEmailLikeValue, publicProfileUsername } from "@/lib/publicProfile";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import { supabase } from "@/lib/supabaseClient";

type PostCommentsSectionProps = {
  postId: string;
  userId: string | null;
  disabled?: boolean;
  onRequireAuth?: () => void;
  mode?: "standalone" | "drawer";
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
  onCountChange?: (count: number) => void;
  uniqueCommentersCount?: boolean;
};

function ShimmerBlock({ className }: { className: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-800/70 before:absolute before:inset-0 before:-translate-x-full before:animate-[spotdrop-shimmer_1.35s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent ${className}`}
    />
  );
}

function CommentListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={`comment-loading-${index}`} className="flex gap-3">
          <ShimmerBlock className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <ShimmerBlock className="h-3 w-24 rounded-full" />
              <ShimmerBlock className="h-2.5 w-12 rounded-full" />
            </div>
            <ShimmerBlock className="h-4 w-full rounded-full" />
            <ShimmerBlock className="h-4 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
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

export default function PostCommentsSection({
  postId,
  userId,
  disabled = false,
  onRequireAuth,
  mode = "standalone",
  drawerOpen = false,
  onDrawerClose,
  onCountChange,
  uniqueCommentersCount = false,
}: PostCommentsSectionProps) {
  const { t } = useI18n();
  const [comments, setComments] = useState<PostCommentRow[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [hasLoadedComments, setHasLoadedComments] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingCount, setLoadingCount] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const commentsEndRef = useRef<HTMLLIElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    const loadCount = async () => {
      if (disabled) {
        setComments([]);
        setCommentCount(0);
        setLoadingCount(false);
        setExpanded(false);
        setHasLoadedComments(false);
        return;
      }

      setLoadingCount(true);
      setError(null);
      setComments([]);
      setExpanded(false);
      setHasLoadedComments(false);

      if (uniqueCommentersCount) {
        const stats = await loadSpotPublicStats(postId);
        setCommentCount(stats?.comments_count ?? 0);
      } else {
        const result = await loadPostCommentsCount(postId);
        setCommentCount(result.count);
        setError(result.error);
      }
      setLoadingCount(false);
    };

    void loadCount();
  }, [postId, disabled, uniqueCommentersCount]);

  useEffect(() => {
    onCountChange?.(commentCount);
  }, [commentCount, onCountChange]);

  useEffect(() => {
    if (expanded && !loadingComments && comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [comments.length, expanded, loadingComments, mode, drawerOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUserProfile = async () => {
      const shouldLoadProfile = mode === "drawer" ? drawerOpen : expanded;

      if (!shouldLoadProfile || !userId || disabled) {
        setCurrentUserProfile(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      setCurrentUserProfile({
        username: publicProfileUsername(data?.username),
        avatar_url: data?.avatar_url ?? null,
      });
    };

    void loadCurrentUserProfile();

    return () => {
      cancelled = true;
    };
  }, [disabled, drawerOpen, expanded, mode, userId]);

  const clearEmailAutofill = () => {
    const input = commentInputRef.current;

    if (!input || !isEmailLikeValue(input.value)) {
      return;
    }

    input.value = "";
    setDraft("");
  };

  useEffect(() => {
    const animationFrameId = window.requestAnimationFrame(clearEmailAutofill);
    const timeoutIds = [100, 500, 1500].map((delay) => window.setTimeout(clearEmailAutofill, delay));

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [userId]);

  const loadComments = async (force = false) => {
    if (disabled || (hasLoadedComments && !force)) {
      return;
    }

    setLoadingComments(true);
    setError(null);

    const result = await loadPostComments(postId);
    setComments(result.comments);
    setError(result.error);
    if (!result.error) {
      if (!uniqueCommentersCount) {
        setCommentCount(result.comments.length);
      }
      setHasLoadedComments(true);
    }
    setLoadingComments(false);
  };

  const commentsVisible = mode === "drawer" ? drawerOpen : expanded;

  useBottomSheetScrollLock(mode === "drawer" && drawerOpen);

  useEffect(() => {
    if (mode !== "drawer" || !drawerOpen || disabled) {
      return;
    }

    setExpanded(true);
    void loadComments(true);
  }, [drawerOpen, postId, disabled, mode]);

  const handleToggleComments = () => {
    setExpanded((current) => {
      const nextExpanded = !current;

      if (nextExpanded && !hasLoadedComments) {
        void loadComments();
      }

      return nextExpanded;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled) {
      return;
    }

    if (!userId) {
      onRequireAuth?.();
      return;
    }

    setPosting(true);
    setError(null);

    if (isEmailLikeValue(draft)) {
      setDraft("");
      setPosting(false);
      return;
    }

    const result = await addPostComment(postId, userId, draft);

    if (result.error) {
      setError(result.error);
      setPosting(false);
      return;
    }

    if (result.comment) {
      setComments((current) => [...current, result.comment!]);
      if (uniqueCommentersCount) {
        const stats = await loadSpotPublicStats(postId);
        if (stats) {
          setCommentCount(stats.comments_count);
        }
      } else {
        setCommentCount((current) => current + 1);
      }
      setHasLoadedComments(true);
      setDraft("");
    }

    setPosting(false);
  };

  const commentsList = loadingComments ? (
    <CommentListSkeleton />
  ) : comments.length === 0 ? (
    <p className="text-sm text-slate-500">{t("comments.empty")}</p>
  ) : (
    <ul className="space-y-4">
      {comments.map((comment) => (
        <li key={comment.id} className="flex gap-3">
          <Link
            href={`/user/${comment.user_id}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800"
          >
            {comment.profiles.avatar_url ? (
              <img src={comment.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} aria-hidden />
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link href={`/user/${comment.user_id}`} className="text-sm font-semibold text-white hover:underline">
                {publicProfileUsername(comment.profiles.username)}
              </Link>
              <time className="text-xs text-slate-500">{formatPostTime(comment.created_at)}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{comment.content}</p>
          </div>
        </li>
      ))}
      <li ref={commentsEndRef} />
    </ul>
  );

  const commentComposer = disabled ? (
    <p className="text-xs text-slate-500">{t("comments.unavailable")}</p>
  ) : (
    <div className="space-y-2">
      {userId ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
            {currentUserProfile?.avatar_url ? (
              <img src={currentUserProfile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.5} aria-hidden />
            )}
          </div>
          <span>
            {t("comments.commentingAs", {
              username: publicProfileUsername(currentUserProfile?.username),
            })}
          </span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex gap-2" autoComplete="off">
        <textarea
          ref={commentInputRef}
          name={`spotdrop-comment-${postId}`}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          rows={1}
          value={draft}
          onFocus={clearEmailAutofill}
          onInput={clearEmailAutofill}
          onChange={(event) => {
            const nextValue = event.target.value;
            setDraft(isEmailLikeValue(nextValue) ? "" : nextValue);
          }}
          placeholder={userId ? t("comments.placeholder") : t("comments.signInToComment")}
          disabled={posting}
          className="min-h-10 max-h-28 min-w-0 flex-1 resize-none rounded-3xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={posting || !draft.trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t("comments.post")}
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        </button>
      </form>
    </div>
  );

  const commentsBody = (
    <>
      {commentsVisible ? commentsList : null}
      {commentsVisible ? commentComposer : null}
      {error ? (
        <p className="text-xs text-red-300">{localizeUserMessage(t, error) ?? error}</p>
      ) : null}
    </>
  );

  if (mode === "drawer") {
    if (!drawerOpen) {
      return null;
    }

    const drawer = (
      <div className={bottomSheetLayout.overlay}>
        <button
          type="button"
          className={bottomSheetLayout.backdrop}
          aria-label={t("common.close")}
          onClick={onDrawerClose}
        />
        <section
          data-bottom-sheet-panel
          className={bottomSheetLayout.panel}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">
              {t("comments.title")}
              <span className="ml-2 text-slate-400">{loadingCount ? "..." : commentCount}</span>
            </h2>
            <button
              type="button"
              onClick={onDrawerClose}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {t("common.close")}
            </button>
          </div>
          <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} px-4 py-4`}>
            {commentsList}
          </div>
          <div className={`${bottomSheetLayout.footer} space-y-2 px-4 py-3`}>
            {commentComposer}
            {error ? (
              <p className="text-xs text-red-300">{localizeUserMessage(t, error) ?? error}</p>
            ) : null}
          </div>
        </section>
      </div>
    );

    if (portalMounted && typeof document !== "undefined") {
      return createPortal(drawer, document.body);
    }

    return drawer;
  }

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={handleToggleComments}
        disabled={disabled}
        aria-expanded={expanded}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
          expanded ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/35" : "bg-white/5 text-white hover:bg-white/10"
        }`}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {t("comments.title")}
        <span className="text-xs font-medium text-slate-400">{loadingCount ? "..." : commentCount}</span>
      </button>

      {commentsBody}
    </section>
  );
}
