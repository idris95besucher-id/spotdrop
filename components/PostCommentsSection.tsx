"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import CommentActionSheet from "@/components/CommentActionSheet";
import CommentRow from "@/components/CommentRow";
import GroupActionConfirmSheet from "@/components/GroupActionConfirmSheet";
import MessageActionErrorToast from "@/components/chat/MessageActionErrorToast";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useI18n } from "@/components/I18nProvider";
import { addPostComment, loadPostComments, loadPostCommentsCount, type PostCommentRow } from "@/lib/postComments";
import { postIdForQuery } from "@/lib/postIds";
import { loadSpotPublicStats } from "@/lib/spotRanking";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { isEmailLikeValue, publicProfileUsername } from "@/lib/publicProfile";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import {
  useChromeNavHidden,
  useEnsureFocusedInputVisible,
  useKeyboardViewportFrame,
} from "@/lib/keyboardSystem";
import { useCommentActions } from "@/lib/useCommentActions";
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
  /** When set, skip the mount-time count query (feed/viewer already have the count). */
  initialCommentCount?: number;
  skipInitialCountFetch?: boolean;
  /** Raise above fullscreen overlays such as the gallery viewer. */
  elevatedOverlay?: boolean;
  /** Brief highlight target when opening from a comment notification. */
  highlightCommentId?: string | null;
};

const DRAWER_SPRING_MS = 320;
const DRAWER_SPRING_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

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
  initialCommentCount,
  skipInitialCountFetch = false,
  elevatedOverlay = false,
  highlightCommentId = null,
}: PostCommentsSectionProps) {
  const { t } = useI18n();
  const [comments, setComments] = useState<PostCommentRow[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [hasLoadedComments, setHasLoadedComments] = useState(false);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedRowRef = useRef<HTMLLIElement | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingCount, setLoadingCount] = useState(true);
  const [posting, setPosting] = useState(false);
  /** Failure loading the count/list for the *current* postId — never a fake/stale count alongside it. */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Failure submitting a new comment — kept separate from loadError so the two states can never render together. */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [drawerPresent, setDrawerPresent] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const commentsEndRef = useRef<HTMLLIElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  /** Tracks the postId a given async load was issued for, so a late response for a photo the
   * user has already swiped away from can never overwrite the currently active photo's state. */
  const activePostIdRef = useRef(postId);

  useEffect(() => {
    activePostIdRef.current = postId;
  }, [postId]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    const loadCount = async () => {
      // Every postId switch starts from a clean slate — regardless of which branch below runs —
      // so a previous photo's comment list/flags/error can never bleed into this one.
      setComments([]);
      setHasLoadedComments(false);
      setLoadError(null);
      setSubmitError(null);
      setExpanded(false);

      if (disabled) {
        setCommentCount(0);
        setLoadingCount(false);
        return;
      }

      if (skipInitialCountFetch && initialCommentCount != null) {
        setCommentCount(initialCommentCount);
        setLoadingCount(false);
        return;
      }

      setLoadingCount(true);

      const requestedPostId = postId;

      const result = uniqueCommentersCount
        ? { count: (await loadSpotPublicStats(postId))?.comments_count ?? 0, error: null as string | null }
        : await loadPostCommentsCount(postId);

      if (activePostIdRef.current !== requestedPostId) {
        return;
      }

      setCommentCount(result.count);
      setLoadError(result.error);
      setLoadingCount(false);
    };

    void loadCount();
  }, [postId, disabled, uniqueCommentersCount, initialCommentCount, skipInitialCountFetch]);

  // Reported via a ref so a re-render that only changes the *identity* of onCountChange (the
  // parent gallery viewer recreates its callback on every photo swipe) can never re-fire this
  // with this component's not-yet-updated commentCount from the previous photo — only a genuine
  // change to commentCount (already scoped to the current postId above) reports upward.
  const onCountChangeRef = useRef(onCountChange);

  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  useEffect(() => {
    onCountChangeRef.current?.(commentCount);
  }, [commentCount]);

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

    const requestedPostId = postId;

    setLoadingComments(true);
    setLoadError(null);

    const result = await loadPostComments(postId);

    // The user may have already swiped to a different photo while this request was in flight —
    // a late response for the photo they left must never overwrite what's now on screen.
    if (activePostIdRef.current !== requestedPostId) {
      return;
    }

    setComments(result.comments);
    setLoadError(result.error);
    if (!result.error) {
      if (!uniqueCommentersCount) {
        setCommentCount(result.comments.length);
      }
      setHasLoadedComments(true);
    }
    setLoadingComments(false);
  };

  const commentActions = useCommentActions({
    userId,
    onCommentUpdated: (updatedComment) => {
      setComments((current) =>
        current.map((comment) => (comment.id === updatedComment.id ? updatedComment : comment))
      );
    },
    onCommentDeleted: (deletedId) => {
      setComments((current) => current.filter((comment) => comment.id !== deletedId));

      if (uniqueCommentersCount) {
        void loadSpotPublicStats(postId).then((stats) => {
          if (stats) {
            setCommentCount(stats.comments_count);
          }
        });
      } else {
        setCommentCount((current) => Math.max(0, current - 1));
      }
    },
  });

  const actionSheetComment = comments.find((comment) => comment.id === commentActions.actionSheetCommentId) ?? null;

  const commentsVisible = mode === "drawer" ? drawerPresent : expanded;

  useEffect(() => {
    if (mode !== "drawer") {
      return;
    }

    if (drawerOpen) {
      setDrawerPresent(true);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setDrawerVisible(true));
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    setDrawerVisible(false);
    const timeout = window.setTimeout(() => setDrawerPresent(false), DRAWER_SPRING_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [drawerOpen, mode]);

  useBottomSheetScrollLock(mode === "drawer" && drawerPresent);
  useChromeNavHidden("sheet-input", mode === "drawer" && drawerPresent);

  const {
    overlayStyle: keyboardOverlayStyle,
    sheetMaxHeight,
    footerPadding,
  } = useKeyboardViewportFrame();
  useEnsureFocusedInputVisible(commentInputRef, mode === "drawer" && drawerPresent);

  useEffect(() => {
    if (mode !== "drawer" || !drawerOpen || disabled) {
      return;
    }

    setExpanded(true);
    void loadComments(true);
  }, [drawerOpen, postId, disabled, mode]);

  useEffect(() => {
    if (!highlightCommentId || !hasLoadedComments || loadingComments) {
      return;
    }

    const exists = comments.some((comment) => String(comment.id) === highlightCommentId);

    // Deleted/missing comments must not crash navigation — open drawer without highlight.
    if (!exists) {
      setActiveHighlightId(null);
      return;
    }

    setActiveHighlightId(highlightCommentId);

    const frame = window.requestAnimationFrame(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = setTimeout(() => {
      setActiveHighlightId(null);
      highlightTimerRef.current = null;
    }, 2200);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [comments, hasLoadedComments, highlightCommentId, loadingComments]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== "drawer" || !drawerOpen || disabled || !postId) {
      return;
    }

    const channel = supabase
      .channel(`post_comments_live_${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "post_comments",
          filter: `post_id=eq.${postIdForQuery(postId)}`,
        },
        () => {
          void loadComments(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "post_comments",
          filter: `post_id=eq.${postIdForQuery(postId)}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: number })?.id;

          if (deletedId == null) {
            void loadComments(true);
            return;
          }

          setComments((current) => current.filter((comment) => comment.id !== deletedId));

          if (!uniqueCommentersCount) {
            setCommentCount((current) => Math.max(0, current - 1));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "post_comments",
          filter: `post_id=eq.${postIdForQuery(postId)}`,
        },
        (payload) => {
          const updated = payload.new as { id?: number; content?: string; edited_at?: string | null };

          if (updated?.id == null) {
            return;
          }

          // Raw postgres_changes rows carry no joined profiles data — merge just the edited
          // columns into whichever comment we already have locally (including the editor's own
          // optimistic update, which this naturally no-ops against since the values will match).
          setComments((current) =>
            current.map((comment) =>
              comment.id === updated.id
                ? { ...comment, content: updated.content ?? comment.content, edited_at: updated.edited_at ?? null }
                : comment
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [disabled, drawerOpen, mode, postId, uniqueCommentersCount]);

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
    setSubmitError(null);

    if (isEmailLikeValue(draft)) {
      setDraft("");
      setPosting(false);
      return;
    }

    const requestedPostId = postId;
    const result = await addPostComment(postId, userId, draft);

    // Never apply a comment (or its error) for a photo the user has already swiped away from.
    if (activePostIdRef.current !== requestedPostId) {
      setPosting(false);
      return;
    }

    if (result.error) {
      setSubmitError(result.error);
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

  // Loading / error / empty / list are mutually exclusive — never render two of these together
  // (e.g. "No comments yet" next to a load-failure banner for the same request).
  const commentsList = loadingComments ? (
    <CommentListSkeleton />
  ) : loadError ? (
    <p className="text-sm text-red-300">{localizeUserMessage(t, loadError) ?? loadError}</p>
  ) : comments.length === 0 ? (
    <p className="text-sm text-slate-500">{t("comments.empty")}</p>
  ) : (
    <ul className="space-y-4">
      {comments.map((comment) => {
        const isHighlighted = activeHighlightId === String(comment.id);

        return (
          <CommentRow
            key={comment.id}
            ref={isHighlighted ? highlightedRowRef : undefined}
            comment={comment}
            isOwnComment={Boolean(userId) && userId === comment.user_id}
            isEditing={commentActions.editingCommentId === comment.id}
            isDeleting={commentActions.deleting && commentActions.confirmDeleteId === comment.id}
            isHighlighted={isHighlighted}
            editDraft={commentActions.editDraft}
            editError={commentActions.editingCommentId === comment.id ? commentActions.editError : null}
            savingEdit={commentActions.savingEdit}
            onLongPress={() => commentActions.openActionSheet(comment.id)}
            onEditDraftChange={commentActions.setEditDraft}
            onSaveEdit={() => void commentActions.saveEdit()}
            onCancelEdit={commentActions.cancelEdit}
          />
        );
      })}
      <li ref={commentsEndRef} />
    </ul>
  );

  const commentComposer = disabled ? (
    <p className="text-xs text-slate-500">{t("comments.unavailable")}</p>
  ) : (
    <div className="space-y-2">
      {userId ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ProfileAvatar
            src={currentUserProfile?.avatar_url}
            sizeClassName="h-6 w-6"
            iconClassName="h-3.5 w-3.5"
            className="bg-slate-800"
          />
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
      {submitError ? (
        <p className="text-xs text-red-300">{localizeUserMessage(t, submitError) ?? submitError}</p>
      ) : null}
    </>
  );

  const commentActionOverlays = (
    <>
      <CommentActionSheet
        isOpen={commentActions.actionSheetCommentId != null}
        onClose={commentActions.closeActionSheet}
        onEdit={
          actionSheetComment && commentActions.canEdit(actionSheetComment)
            ? () => commentActions.startEdit(actionSheetComment)
            : undefined
        }
        onDelete={
          actionSheetComment && commentActions.canDelete(actionSheetComment)
            ? () => commentActions.requestDelete(actionSheetComment.id)
            : undefined
        }
      />
      <GroupActionConfirmSheet
        isOpen={commentActions.confirmDeleteId != null}
        title={t("comments.actions.deleteConfirmTitle")}
        body={t("comments.actions.deleteConfirmBody")}
        confirmLabel={commentActions.deleting ? t("comments.actions.deleting") : t("comments.actions.delete")}
        destructive
        working={commentActions.deleting}
        onClose={commentActions.cancelDelete}
        onConfirm={() => void commentActions.confirmDelete()}
      />
      <MessageActionErrorToast
        message={
          commentActions.actionError
            ? localizeUserMessage(t, commentActions.actionError) ?? commentActions.actionError
            : null
        }
        onDismiss={commentActions.dismissActionError}
      />
    </>
  );

  if (mode === "drawer") {
    if (!drawerPresent) {
      return commentActions.actionSheetCommentId != null || commentActions.confirmDeleteId != null
        ? commentActionOverlays
        : null;
    }

    const overlayClassName = elevatedOverlay
      ? "fixed inset-x-0 z-[210] flex items-end justify-center overscroll-none sm:items-center sm:p-4"
      : "fixed inset-x-0 z-[130] flex items-end justify-center overscroll-none sm:items-center sm:p-4";

    const drawer = (
      <div className={overlayClassName} style={keyboardOverlayStyle}>
        <button
          type="button"
          className={`${bottomSheetLayout.backdrop} transition-opacity duration-300 ${
            drawerVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionTimingFunction: DRAWER_SPRING_EASING }}
          aria-label={t("common.close")}
          onClick={onDrawerClose}
        />
        <section
          data-bottom-sheet-panel
          className={bottomSheetLayout.panel}
          style={{
            maxHeight: sheetMaxHeight,
            transform: drawerVisible ? "translateY(0)" : "translateY(100%)",
            transition: `transform ${DRAWER_SPRING_MS}ms ${DRAWER_SPRING_EASING}`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">
              {t("comments.title")}
              <span className="ml-2 text-slate-400">
                {loadingCount ? "..." : loadError ? "–" : commentCount}
              </span>
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
          <div
            className="shrink-0 space-y-2 border-t border-white/10 px-4 py-3"
            style={{ paddingBottom: footerPadding }}
          >
            {commentComposer}
            {submitError ? (
              <p className="text-xs text-red-300">{localizeUserMessage(t, submitError) ?? submitError}</p>
            ) : null}
          </div>
        </section>
      </div>
    );

    if (portalMounted && typeof document !== "undefined") {
      return createPortal(
        <>
          {drawer}
          {commentActionOverlays}
        </>,
        document.body
      );
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
        <span className="text-xs font-medium text-slate-400">
          {loadingCount ? "..." : loadError ? "–" : commentCount}
        </span>
      </button>

      {commentsBody}
      {commentActionOverlays}
    </section>
  );
}
