"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { Check, Loader2, X as XIcon } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useI18n } from "@/components/I18nProvider";
import type { PostCommentRow as PostCommentRowType } from "@/lib/postComments";
import { formatPostTime } from "@/lib/posts";
import { publicProfileUsername } from "@/lib/publicProfile";
import { useLongPress } from "@/lib/useLongPress";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";

type CommentRowProps = {
  comment: PostCommentRowType;
  isOwnComment: boolean;
  isEditing: boolean;
  isDeleting: boolean;
  isHighlighted?: boolean;
  editDraft: string;
  editError: string | null;
  savingEdit: boolean;
  onLongPress: () => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
};

/**
 * A single comment row, its own component (not inlined in a .map()) specifically so the
 * long-press gesture can call useLongPress once per instance and attach directly to the <li> —
 * wrapping it in an extra <div> (as the generic MessageLongPressZone does) would put a <div>
 * directly inside the parent <ul>, which is invalid HTML. Reused everywhere PostCommentsSection
 * renders a comment: My Gallery, other users' galleries, Spot/post comments, feed, etc.
 */
const CommentRow = forwardRef<HTMLLIElement, CommentRowProps>(function CommentRow(
  {
    comment,
    isOwnComment,
    isEditing,
    isDeleting,
    isHighlighted = false,
    editDraft,
    editError,
    savingEdit,
    onLongPress,
    onEditDraftChange,
    onSaveEdit,
    onCancelEdit,
  },
  ref
) {
  const { t } = useI18n();
  const { longPressProps, onClickCapture } = useLongPress({
    onLongPress,
    disabled: !isOwnComment || isEditing,
  });

  return (
    <li
      ref={ref}
      {...longPressProps}
      onClickCapture={onClickCapture}
      className={`flex gap-3 rounded-2xl select-none touch-manipulation transition ${
        isDeleting ? "opacity-50" : ""
      } ${isHighlighted ? "bg-primary/15 ring-1 ring-primary/40 -mx-2 px-2 py-1.5" : ""}`}
    >
      <Link href={`/user?id=${comment.user_id}`} className="shrink-0">
        <ProfileAvatar
          src={comment.profiles.avatar_url}
          sizeClassName="h-9 w-9"
          iconClassName="h-4 w-4"
          className="bg-slate-800"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link href={`/user?id=${comment.user_id}`} className="text-sm font-semibold text-white hover:underline">
            {publicProfileUsername(comment.profiles.username)}
          </Link>
          <time className="text-xs text-slate-500">{formatPostTime(comment.created_at)}</time>
          {comment.edited_at ? (
            <span className="text-[11px] text-slate-500">· {t("comments.edited")}</span>
          ) : null}
        </div>

        {isEditing ? (
          <div className="mt-1.5 space-y-2">
            <textarea
              autoFocus
              rows={2}
              value={editDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              disabled={savingEdit}
              className="min-h-[2.5rem] w-full resize-none rounded-2xl border border-cyan-400/30 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
            />
            {editError ? (
              <p className="text-xs text-red-300">{localizeUserMessage(t, editError) ?? editError}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={savingEdit || !editDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingEdit ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                )}
                {t("comments.editSave")}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={savingEdit}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                <XIcon className="h-3.5 w-3.5" aria-hidden />
                {t("comments.editCancel")}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{comment.content}</p>
        )}
      </div>
    </li>
  );
});

export default CommentRow;
