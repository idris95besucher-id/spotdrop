"use client";

import { useCallback, useRef, useState } from "react";
import { canEditComment } from "@/lib/commentEditWindow";
import { deletePostComment, updatePostComment, type PostCommentRow } from "@/lib/postComments";

type UseCommentActionsOptions = {
  userId: string | null;
  onCommentUpdated: (comment: PostCommentRow) => void;
  onCommentDeleted: (commentId: number) => void;
};

/**
 * Shared edit/delete behavior for comment rows — used by the single PostCommentsSection
 * component, which every screen with comments (My Gallery, other users' galleries, Spot/post
 * comments, feed, city room shared spots, ...) renders through. There is deliberately no
 * per-screen copy of this logic.
 */
export function useCommentActions({ userId, onCommentUpdated, onCommentDeleted }: UseCommentActionsOptions) {
  const [actionSheetCommentId, setActionSheetCommentId] = useState<number | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const deletingIdsRef = useRef<Set<number>>(new Set());

  const canEdit = useCallback(
    (comment: PostCommentRow) => Boolean(userId) && userId === comment.user_id && canEditComment(comment.created_at),
    [userId]
  );

  const canDelete = useCallback(
    (comment: PostCommentRow) => Boolean(userId) && userId === comment.user_id,
    [userId]
  );

  const openActionSheet = useCallback((commentId: number) => setActionSheetCommentId(commentId), []);
  const closeActionSheet = useCallback(() => setActionSheetCommentId(null), []);

  const startEdit = useCallback(
    (comment: PostCommentRow) => {
      if (!canEdit(comment)) {
        return;
      }

      setEditError(null);
      setEditingCommentId(comment.id);
      setEditDraft(comment.content);
      setActionSheetCommentId(null);
    },
    [canEdit]
  );

  const cancelEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditDraft("");
    setEditError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!userId || editingCommentId == null) {
      return;
    }

    const trimmed = editDraft.trim();

    if (!trimmed) {
      setEditError("Comment cannot be empty.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    const { comment, error } = await updatePostComment(editingCommentId, userId, trimmed);

    if (error || !comment) {
      setEditError(error ?? "Unable to save your edit.");
      setSavingEdit(false);
      return;
    }

    onCommentUpdated(comment);
    setEditingCommentId(null);
    setEditDraft("");
    setSavingEdit(false);
  }, [editDraft, editingCommentId, onCommentUpdated, userId]);

  const requestDelete = useCallback((commentId: number) => {
    setConfirmDeleteId(commentId);
    setActionSheetCommentId(null);
  }, []);

  const cancelDelete = useCallback(() => {
    if (deleting) {
      return;
    }

    setConfirmDeleteId(null);
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!userId || confirmDeleteId == null) {
      return;
    }

    const commentId = confirmDeleteId;

    if (deletingIdsRef.current.has(commentId)) {
      return;
    }

    deletingIdsRef.current.add(commentId);
    setDeleting(true);

    const { error } = await deletePostComment(commentId, userId);

    deletingIdsRef.current.delete(commentId);
    setDeleting(false);

    if (error) {
      setActionError(error);
      setConfirmDeleteId(null);
      return;
    }

    onCommentDeleted(commentId);
    setConfirmDeleteId(null);
  }, [confirmDeleteId, onCommentDeleted, userId]);

  const dismissActionError = useCallback(() => setActionError(null), []);

  return {
    canEdit,
    canDelete,
    actionSheetCommentId,
    openActionSheet,
    closeActionSheet,
    editingCommentId,
    editDraft,
    setEditDraft,
    editError,
    savingEdit,
    startEdit,
    cancelEdit,
    saveEdit,
    confirmDeleteId,
    deleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
    actionError,
    dismissActionError,
  };
}
